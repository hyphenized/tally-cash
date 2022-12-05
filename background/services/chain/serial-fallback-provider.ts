import {
  AlchemyProvider,
  AlchemyWebSocketProvider,
  EventType,
  JsonRpcProvider,
  Listener,
  WebSocketProvider,
} from "@ethersproject/providers"
import { utils } from "ethers"
import { getNetwork } from "@ethersproject/networks"
import {
  MINUTE,
  SECOND,
  CHAIN_ID_TO_RPC_URLS,
  ALCHEMY_SUPPORTED_CHAIN_IDS,
  RPC_METHOD_PROVIDER_ROUTING,
} from "../../constants"
import logger from "../../lib/logger"
import { AnyEVMTransaction, EVMNetwork } from "../../networks"
import { AddressOnNetwork } from "../../accounts"
import { transactionFromEthersTransaction } from "./utils"
import {
  ALCHEMY_KEY,
  transactionFromAlchemyWebsocketTransaction,
} from "../../lib/alchemy"

// Back off by this amount as a base, exponentiated by attempts and jittered.
const BASE_BACKOFF_MS = 150
// Reset backoffs after 5 minutes.
const COOLDOWN_PERIOD = 5 * MINUTE
// Retry 8 times before falling back to the next provider.
// This generally results in a wait time of around 30 seconds (with a maximum time
// of 76.5 seconds for 8 completely serial requests) before falling back since we
// usually have multiple requests going out at once.
const MAX_RETRIES = 8
// Wait 15 seconds between primary provider reconnect attempts.
const PRIMARY_PROVIDER_RECONNECT_INTERVAL = 15 * SECOND
// Wait 2 seconds after a primary provider is created before resubscribing.
const WAIT_BEFORE_SUBSCRIBING = 2 * SECOND
// Wait 100ms before attempting another send if a websocket provider is still connecting.
const WAIT_BEFORE_SEND_AGAIN = 100
// Percentage of .send calls to route to alchemy
const ALCHEMY_RPC_CALL_PERCENTAGE = 50
/**
 * Wait the given number of ms, then run the provided function. Returns a
 * promise that will resolve after the delay has elapsed and the passed
 * function has executed, with the result of the passed function.
 */
function waitAnd<T, E extends Promise<T>>(
  waitMs: number,
  fn: () => E
): Promise<T> {
  return new Promise((resolve) => {
    // TODO setTimeout rather than browser.alarms here could mean this would
    // hang when transitioning to a transient background page? Can we do this
    // with browser.alarms?
    setTimeout(() => {
      resolve(fn())
    }, waitMs)
  })
}

/**
 * Given the number of the backoff being executed, returns a jittered number of
 * ms to back off before making the next attempt.
 */
function backedOffMs(backoffCount: number): number {
  const backoffSlotStart = BASE_BACKOFF_MS * 2 ** backoffCount
  const backoffSlotEnd = BASE_BACKOFF_MS * 2 ** (backoffCount + 1)

  return backoffSlotStart + Math.random() * (backoffSlotEnd - backoffSlotStart)
}

/**
 * Returns true if the given provider is using a WebSocket AND the WebSocket is
 * either closing or already closed. Ethers does not provide direct access to
 * this information, nor does it attempt to reconnect in these cases.
 */
function isClosedOrClosingWebSocketProvider(
  provider: JsonRpcProvider
): boolean {
  if (provider instanceof WebSocketProvider) {
    // Digging into the innards of Ethers here because there's no
    // other way to get access to the WebSocket connection situation.
    // eslint-disable-next-line no-underscore-dangle
    const webSocket = provider._websocket as WebSocket

    return (
      webSocket.readyState === WebSocket.CLOSING ||
      webSocket.readyState === WebSocket.CLOSED
    )
  }

  return false
}

/**
 * Returns true if the given provider is using a WebSocket AND the WebSocket is
 * connecting. Ethers does not provide direct access to this information.
 */
function isConnectingWebSocketProvider(provider: JsonRpcProvider): boolean {
  if (provider instanceof WebSocketProvider) {
    // Digging into the innards of Ethers here because there's no
    // other way to get access to the WebSocket connection situation.
    // eslint-disable-next-line no-underscore-dangle
    const webSocket = provider._websocket as WebSocket
    return webSocket.readyState === WebSocket.CONNECTING
  }

  return false
}

/**
 * Return the decision whether a given RPC call should be routed to the alchemy provider
 * or the generic provider.
 *
 * Checking whether is alchemy supported is a non concern for this function!
 *
 * @param chainID string chainID to handle chain specific routings
 * @param method the current RPC method
 * @returns true | false whether the method on a given network should routed to alchemy or can be sent over the generic provider
 */
function alchemyOrDefaultProvider(chainID: string, method: string): boolean {
  return (
    RPC_METHOD_PROVIDER_ROUTING.everyChain.some((m: string) =>
      method.startsWith(m)
    ) ||
    (RPC_METHOD_PROVIDER_ROUTING[Number(chainID)] ?? []).some((m: string) =>
      method.startsWith(m)
    )
  )
}

/**
 * The SerialFallbackProvider is an Ethers JsonRpcProvider that can fall back
 * through a series of providers in case previous ones fail.
 *
 * In case of server errors, this provider attempts a number of exponential
 * backoffs and retries before falling back to the next provider in the list.
 * WebSocketProviders in the list are checked for WebSocket connections, and
 * attempt reconnects if the underlying WebSocket disconnects.
 *
 * Additionally, subscriptions are tracked and, if the current provider is a
 * WebSocket provider, they are restored on reconnect.
 */
export default class SerialFallbackProvider extends JsonRpcProvider {
  // Functions that will create and initialize a new provider, in priority
  // order.
  private providerCreators: [
    () => WebSocketProvider | JsonRpcProvider,
    ...(() => JsonRpcProvider)[]
  ]

  // The currently-used provider, produced by the provider-creator at
  // currentProviderIndex.
  private currentProvider: JsonRpcProvider

  private alchemyProvider: JsonRpcProvider | undefined

  private alchemyProviderCreator:
    | (() => WebSocketProvider | JsonRpcProvider)
    | undefined

  supportsAlchemy = false

  /**
   * Since our architecture follows a pattern of using distinct provider instances
   * per network - and we know that a given provider will never switch its network
   * (rather - we will switch the provider the extension is using) - we can avoid
   * eth_chainId RPC calls.
   */
  private cachedChainId: string

  // The index of the provider creator that created the current provider. Used
  // for reconnects when relevant.
  private currentProviderIndex = 0

  // TEMPORARY cache for latest account balances to reduce number of rpc calls
  // This is intended as a temporary fix to the burst of account enrichment that
  // happens when the extension is first loaded up as a result of activity emission
  // inside of chainService.connectChainService
  private latestBalanceCache: {
    [address: string]: {
      balance: string
      updatedAt: number
    }
  } = {}

  // TEMPORARY cache for if an address has code to reduce number of rpc calls
  // This is intended as a temporary fix to the burst of account enrichment that
  // happens when the extension is first loaded up as a result of activity emission
  // inside of chainService.connectChainService
  // There is no TTL here as the cache will get reset every time the extension is
  // reloaded and the property of having code updates quite rarely.
  private latestHasCodeCache: {
    [address: string]: {
      hasCode: boolean
    }
  } = {}

  // Information on the current backoff state. This is used to ensure retries
  // and reconnects back off exponentially.
  private currentBackoff = {
    providerIndex: 0,
    backoffMs: BASE_BACKOFF_MS,
    backoffCount: 0,
    lastBackoffTime: 0,
  }

  // Information on WebSocket-style subscriptions. Tracked here so as to
  // restore them in case of WebSocket disconnects.
  private subscriptions: {
    tag: string
    param: unknown[]
    processFunc: (result: unknown) => void
  }[] = []

  // Information on event subscriptions, which can be restored on non-WebSocket
  // subscriptions and WebSocket subscriptions both.
  private eventSubscriptions: {
    eventName: EventType
    listener: Listener | (Listener & { wrappedListener: Listener })
    once: boolean
  }[] = []

  constructor(
    // Internal network type useful for helper calls, but not exposed to avoid
    // clashing with Ethers's own `network` stuff.
    private evmNetwork: EVMNetwork,
    providerCreators: Array<{
      type: "alchemy" | "generic"
      creator: () => WebSocketProvider | JsonRpcProvider
    }>
  ) {
    const [firstProviderCreator, ...remainingProviderCreators] =
      providerCreators.map((pc) => pc.creator)

    const firstProvider = firstProviderCreator()

    super(firstProvider.connection, firstProvider.network)

    this.currentProvider = firstProvider

    const alchemyProviderCreator = providerCreators.find(
      (creator) => creator.type === "alchemy"
    )

    if (alchemyProviderCreator) {
      this.supportsAlchemy = true
      this.alchemyProviderCreator = alchemyProviderCreator.creator
      this.alchemyProvider = this.alchemyProviderCreator()
    }

    setInterval(() => {
      this.attemptToReconnectToPrimaryProvider()
      this.attemptToReconnectToAlchemyProvider()
    }, PRIMARY_PROVIDER_RECONNECT_INTERVAL)

    this.cachedChainId = utils.hexlify(Number(evmNetwork.chainID))
    this.providerCreators = [firstProviderCreator, ...remainingProviderCreators]
  }

  private async routeRpcCall(
    method: string,
    params: unknown
  ): Promise<unknown> {
    if (
      this.alchemyProvider &&
      Math.random() < ALCHEMY_RPC_CALL_PERCENTAGE / 100
    ) {
      // Cast `unknown` to `any` - which is the type that the send method expects.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return this.alchemyProvider.send(method, params as Array<any>)
    }
    // Cast `unknown` to `any` - which is the type that the send method expects.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.currentProvider.send(method, params as Array<any>)
  }

  /**
   * Override the core `send` method to handle disconnects and other errors
   * that should trigger retries. Ethers already does internal retrying, but
   * this retry methodology eventually falls back on another provider, handles
   * WebSocket disconnects, and restores subscriptions where
   * possible/necessary.
   */
  override async send(method: string, params: unknown[]): Promise<unknown> {
    if (method === "eth_chainId") {
      return this.cachedChainId
    }

    // @TODO Remove once initial activity load is refactored.
    if (method === "eth_getBalance" && (params as string[])[1] === "latest") {
      const address = (params as string[])[0]
      const now = Date.now()
      const lastUpdate = this.latestBalanceCache[address]?.updatedAt
      if (lastUpdate && now < lastUpdate + 1 * SECOND) {
        return this.latestBalanceCache[address].balance
      }
    }

    // @TODO Remove once initial activity load is refactored.
    if (method === "eth_getCode" && (params as string[])[1] === "latest") {
      const address = (params as string[])[0]
      if (typeof this.latestHasCodeCache[address] !== "undefined") {
        return this.latestHasCodeCache[address].hasCode
      }
    }

    if (
      // Force some methods to be handled by alchemy if we're on an alchemy supported chain
      this.alchemyProvider &&
      alchemyOrDefaultProvider(this.cachedChainId, method)
    ) {
      return this.alchemyProvider.send(method, params)
    }

    if (/^alchemy_|^eth_subscribe$/.test(method)) {
      throw new Error(
        `Calling ${method} is not supported on ${this.currentProvider.network.name}`
      )
    }

    try {
      if (isClosedOrClosingWebSocketProvider(this.currentProvider)) {
        // Detect disconnected WebSocket and immediately throw.
        throw new Error("WebSocket is already in CLOSING")
      }

      if (isConnectingWebSocketProvider(this.currentProvider)) {
        // If the websocket is still connecting, wait and try to send again.
        return await waitAnd(WAIT_BEFORE_SEND_AGAIN, async () =>
          this.send(method, params)
        )
      }

      const result = await this.routeRpcCall(method, params)

      // @TODO Remove once initial activity load is refactored.
      if (method === "eth_getBalance" && (params as string[])[1] === "latest") {
        const address = (params as string[])[0]
        this.latestBalanceCache[address] = {
          balance: result as string,
          updatedAt: Date.now(),
        }
      }

      // @TODO Remove once initial activity load is refactored.
      if (method === "eth_getCode" && (params as string[])[1] === "latest") {
        const address = (params as string[])[0]
        this.latestHasCodeCache[address] = {
          hasCode: result as boolean,
        }
      }

      return result
    } catch (error) {
      // Awful, but what can ya do.
      const stringifiedError = String(error)

      if (
        stringifiedError.match(
          /WebSocket is already in CLOSING|bad response|missing response/
        )
      ) {
        const backoff = this.backoffFor(this.currentProviderIndex)
        if (typeof backoff === "undefined") {
          logger.debug(
            "Attempting to connect new provider after error",
            error,
            "."
          )
          this.disconnectCurrentProvider()

          this.currentProviderIndex += 1
          if (this.currentProviderIndex < this.providerCreators.length) {
            // Try again with the next provider.
            await this.reconnectProvider()

            return await this.send(method, params)
          }

          // If we've looped around, set us up for the next call, but fail the
          // current one since we've gone through every available provider. Note
          // that this may happen over time, but we still fail the request that
          // hits the end of the list.
          this.currentProviderIndex = 0

          // Reconnect, but don't wait for the connection to go through.
          this.reconnectProvider()

          throw error
        } else {
          logger.debug(
            "Backing off for",
            backoff,
            "and retrying: ",
            method,
            params
          )

          return await waitAnd(backoff, async () => {
            if (isClosedOrClosingWebSocketProvider(this.currentProvider)) {
              await this.reconnectProvider()
            }

            logger.debug("Retrying", method, params)
            return this.send(method, params)
          })
        }
      }

      logger.debug(
        "Skipping fallback for unidentified error",
        error,
        "for provider",
        this.currentProvider
      )

      throw error
    }
  }

  /**
   * Exposes direct WebSocket subscription by JSON-RPC method. Takes immediate
   * effect if the current underlying provider is a WebSocketProvider. If it is
   * not, queues the subscription up for when a WebSocketProvider can connect.
   */
  async subscribe(
    tag: string,
    param: Array<unknown>,
    processFunc: (result: unknown) => void
  ): Promise<void> {
    const subscription = { tag, param, processFunc }

    if (this.currentProvider instanceof WebSocketProvider) {
      // eslint-disable-next-line no-underscore-dangle
      await this.currentProvider._subscribe(tag, param, processFunc)
      this.subscriptions.push(subscription)
    } else {
      logger.warn(
        "Current provider is not a WebSocket provider; subscription " +
          "will not work until a WebSocket provider connects."
      )
    }
  }

  /**
   * Subscribe to pending transactions that have been resolved to a full
   * transaction object; uses optimized paths when the provider supports it,
   * otherwise subscribes to pending transaction hashes and manually resolves
   * them with a transaction lookup.
   */
  async subscribeFullPendingTransactions(
    { address, network }: AddressOnNetwork,
    handler: (pendingTransaction: AnyEVMTransaction) => void
  ): Promise<void> {
    if (this.evmNetwork.chainID !== network.chainID) {
      logger.error(
        `Tried to subscribe to pending transactions for chain id ` +
          `${network.chainID} but provider was on ` +
          `${this.evmNetwork.chainID}`
      )
      return
    }

    const alchemySubscription =
      await this.alchemySubscribeFullPendingTransactions(
        { address, network },
        handler
      )

    if (alchemySubscription === "unsupported") {
      // Fall back on a standard pending transaction subscription if the
      // Alchemy version is unsupported.
      this.on("pending", async (transactionHash: unknown) => {
        try {
          if (typeof transactionHash === "string") {
            const transaction = transactionFromEthersTransaction(
              await this.getTransaction(transactionHash),
              network
            )

            handler(transaction)
          }
        } catch (innerError) {
          logger.error(
            `Error handling incoming pending transaction hash: ${transactionHash}`,
            innerError
          )
        }
      })
    }
  }

  /**
   * Behaves the same as the `JsonRpcProvider` `on` method, but also trakcs the
   * event subscription so that an underlying provider failure will not prevent
   * it from firing.
   */
  override on(eventName: EventType, listener: Listener): this {
    this.eventSubscriptions.push({
      eventName,
      listener,
      once: false,
    })

    this.currentProvider.on(eventName, listener)

    return this
  }

  /**
   * Behaves the same as the `JsonRpcProvider` `once` method, but also trakcs
   * the event subscription so that an underlying provider failure will not
   * prevent it from firing.
   */
  override once(eventName: EventType, listener: Listener): this {
    const adjustedListener = this.listenerWithCleanup(eventName, listener)

    this.eventSubscriptions.push({
      eventName,
      listener: adjustedListener,
      once: true,
    })

    this.currentProvider.once(eventName, listener)

    return this
  }

  /**
   * Removes one or all listeners for a given event.
   *
   * Ensures these will not be restored during a reconnect.
   */
  override off(eventName: EventType, listenerToRemove?: Listener): this {
    this.eventSubscriptions = this.eventSubscriptions.filter(
      ({ eventName: savedEventName, listener: savedListener }) => {
        if (savedEventName === eventName) {
          // No explicit listener to remove = remove all listeners.
          if (
            typeof listenerToRemove === "undefined" ||
            listenerToRemove === null
          ) {
            return true
          }

          // If the listener is wrapped, use that to check against the
          // specified listener to remove.
          if ("wrappedListener" in savedListener) {
            return savedListener.wrappedListener === listenerToRemove
          }

          // Otherwise, directly compare.
          return savedListener === listenerToRemove
        }

        return false
      }
    )

    this.currentProvider.off(eventName, listenerToRemove)

    return this
  }

  /**
   * Handles any cleanup needed for the current provider.
   *
   * Useful especially for when a non-WebSocket provider is tracking events,
   * which are done via polling. In these cases, if the provider became
   * available again, even if it was no longer the current provider, it would
   * start calling its event handlers again; disconnecting in this way
   * unsubscribes all those event handlers so they can be attached to the new
   * current provider.
   */
  private async disconnectCurrentProvider() {
    logger.debug(
      "Disconnecting current provider; websocket: ",
      this.currentProvider instanceof WebSocketProvider,
      "."
    )
    if (this.currentProvider instanceof WebSocketProvider) {
      this.currentProvider.destroy()
    } else {
      // For non-WebSocket providers, kill all subscriptions so the listeners
      // won't fire; the next provider will pick them up. We could lose events
      // in between, but if we're considering the current provider dead, let's
      // assume we would lose them anyway.
      this.eventSubscriptions.forEach(({ eventName }) =>
        this.removeAllListeners(eventName)
      )
    }
  }

  /**
   * Wraps an Ethers listener function meant to only be invoked once with
   * cleanup to ensure it won't be resubscribed in case of a provider switch.
   */
  private listenerWithCleanup(
    eventName: EventType,
    listenerToWrap: Listener
  ): Listener & { wrappedListener: Listener } {
    const wrappedListener = (
      ...params: Parameters<Listener>
    ): ReturnType<Listener> => {
      try {
        listenerToWrap(...params)
      } finally {
        this.eventSubscriptions = this.eventSubscriptions.filter(
          ({ eventName: storedEventName, listener, once }) =>
            eventName !== storedEventName ||
            listener !== wrappedListener ||
            once !== true
        )
      }
    }

    wrappedListener.wrappedListener = listenerToWrap

    return wrappedListener
  }

  /**
   * Reconnects the currently-selected provider. If the current provider index
   * has been somehow set out of range, resets it to 0.
   */
  private async reconnectProvider() {
    await this.disconnectCurrentProvider()
    if (this.currentProviderIndex >= this.providerCreators.length) {
      this.currentProviderIndex = 0
    }

    logger.debug(
      "Reconnecting provider at index",
      this.currentProviderIndex,
      "..."
    )

    this.currentProvider = this.providerCreators[this.currentProviderIndex]()
    await this.resubscribe(this.currentProvider)

    // TODO After a longer backoff, attempt to reset the current provider to 0.
  }

  /**
   * Resubscribes existing WebSocket subscriptions (if the current provider is
   * a `WebSocketProvider`) and regular Ethers subscriptions (for all
   * providers).
   * @param provider The provider to use to resubscribe
   * @returns A boolean indicating if websocket subscription was successful or not
   */
  private async resubscribe(provider: JsonRpcProvider): Promise<boolean> {
    logger.debug("Resubscribing subscriptions...")

    if (
      isClosedOrClosingWebSocketProvider(provider) ||
      isConnectingWebSocketProvider(provider)
    ) {
      return false
    }

    if (!provider.network) {
      return false
    }

    if (provider instanceof WebSocketProvider) {
      const websocketProvider = provider as WebSocketProvider

      // Chain promises to serially resubscribe.
      //
      // TODO If anything fails along the way, it should yield the same kind of
      // TODO backoff as a regular `send`.
      await this.subscriptions.reduce(
        (previousPromise, { tag, param, processFunc }) =>
          previousPromise.then(() =>
            waitAnd(backedOffMs(0), () =>
              // Direct subscriptions are internal, but we want to be able to
              // restore them.
              // eslint-disable-next-line no-underscore-dangle
              websocketProvider._subscribe(tag, param, processFunc)
            )
          ),
        Promise.resolve()
      )
    }

    this.eventSubscriptions.forEach(({ eventName, listener, once }) => {
      if (once) {
        provider.once(eventName, listener)
      } else {
        provider.on(eventName, listener)
      }
    })

    logger.debug("Subscriptions resubscribed...")
    return true
  }

  private async attemptToReconnectToAlchemyProvider(): Promise<void> {
    if (
      this.alchemyProvider &&
      this.alchemyProviderCreator &&
      isClosedOrClosingWebSocketProvider(this.alchemyProvider)
    ) {
      // Always reconnect without resubscribing - since subscriptions
      // should live on the currentProvider
      this.alchemyProvider = this.alchemyProviderCreator()
    }
  }

  private async attemptToReconnectToPrimaryProvider(): Promise<unknown> {
    if (this.currentProviderIndex === 0) {
      // If we are already connected to the primary provider - don't resubscribe
      return null
    }
    const primaryProvider = this.providerCreators[0]()
    // We need to wait before attempting to resubscribe of the primaryProvider's
    // websocket connection will almost always still be in a CONNECTING state when
    // resubscribing.
    return waitAnd(WAIT_BEFORE_SUBSCRIBING, async (): Promise<unknown> => {
      const subscriptionsSuccessful = await this.resubscribe(primaryProvider)
      if (!subscriptionsSuccessful) {
        return
      }
      // Cleanup the subscriptions on the backup provider.
      await this.disconnectCurrentProvider()
      // only set if subscriptions are successful
      this.currentProvider = primaryProvider
      this.currentProviderIndex = 0
    })
  }

  /**
   * Computes the backoff time for the given provider index. If the provider
   * index is new, starts with the base backoff; if the provider index is
   * unchanged, computes a jittered exponential backoff. If the current
   * provider has already exceeded its maximum retries, returns undefined to
   * signal that the provider should be considered dead for the time being.
   *
   * Backoffs respect a cooldown time after which they reset down to the base
   * backoff time.
   */
  private backoffFor(providerIndex: number): number | undefined {
    const {
      providerIndex: existingProviderIndex,
      backoffCount,
      lastBackoffTime,
    } = this.currentBackoff

    if (backoffCount > MAX_RETRIES) {
      return undefined
    }

    if (existingProviderIndex !== providerIndex) {
      this.currentBackoff = {
        providerIndex,
        backoffMs: BASE_BACKOFF_MS,
        backoffCount: 0,
        lastBackoffTime: Date.now(),
      }
    } else if (Date.now() - lastBackoffTime > COOLDOWN_PERIOD) {
      this.currentBackoff = {
        providerIndex,
        backoffMs: BASE_BACKOFF_MS,
        backoffCount: 0,
        lastBackoffTime: Date.now(),
      }
    } else {
      // The next backoff slot starts at the current minimum backoff and
      // extends until the start of the next backoff. This specific backoff is
      // randomized within that slot.
      const newBackoffCount = backoffCount + 1
      const backoffMs = backedOffMs(newBackoffCount)

      this.currentBackoff = {
        providerIndex,
        backoffMs,
        backoffCount: newBackoffCount,
        lastBackoffTime: Date.now(),
      }
    }

    return this.currentBackoff.backoffMs
  }

  /**
   * Attempts to subscribe to pending transactions in an Alchemy-specific
   * way. Returns `subscribed` if the subscription succeeded, or `unsupported`
   * if the underlying provider did not support Alchemy-specific subscriptions.
   */
  private async alchemySubscribeFullPendingTransactions(
    { address, network }: AddressOnNetwork,
    handler: (pendingTransaction: AnyEVMTransaction) => void
  ): Promise<"subscribed" | "unsupported"> {
    try {
      await this.subscribe(
        "filteredNewFullPendingTransactionsSubscriptionID",
        [
          "alchemy_pendingTransactions",
          { fromAddress: address, toAddress: address },
        ],
        async (result: unknown) => {
          // TODO use proper provider string
          // handle incoming transactions for an account
          try {
            const transaction = transactionFromAlchemyWebsocketTransaction(
              result,
              network
            )

            handler(transaction)
          } catch (error) {
            logger.error(
              `Error handling incoming pending transaction: ${result}`,
              error
            )
          }
        }
      )

      return "subscribed"
    } catch (error) {
      const errorString = String(error)
      if (errorString.match(/is unsupported on/i)) {
        return "unsupported"
      }

      throw error
    }
  }
}

export function makeSerialFallbackProvider(
  network: EVMNetwork
): SerialFallbackProvider {
  const alchemyProviderCreators = ALCHEMY_SUPPORTED_CHAIN_IDS.has(
    network.chainID
  )
    ? [
        {
          type: "alchemy" as const,
          creator: () =>
            new AlchemyProvider(
              getNetwork(Number(network.chainID)),
              ALCHEMY_KEY
            ),
        },
        {
          type: "alchemy" as const,
          creator: () =>
            new AlchemyWebSocketProvider(
              getNetwork(Number(network.chainID)),
              ALCHEMY_KEY
            ),
        },
      ]
    : []

  const genericProviders = (CHAIN_ID_TO_RPC_URLS[network.chainID] || []).map(
    (rpcUrl) => ({
      type: "generic" as const,
      creator: () => new JsonRpcProvider(rpcUrl),
    })
  )

  return new SerialFallbackProvider(network, [
    // Prefer alchemy as the primary provider when available
    ...genericProviders,
    ...alchemyProviderCreators,
  ])
}
