import { fetchJson } from "@ethersproject/web"
import { NETWORK_BY_CHAIN_ID } from "../constants"
import { NFT, NFTCollection, NFTsWithPagesResponse } from "../nfts"
import { HexString } from "../types"
import logger from "./logger"
import { sameEVMAddress } from "./utils"

type SimpleHashNFTModel = {
  nft_id: string
  token_id: string | null
  name: string | null
  description: string | null
  contract_address: string
  chain: "polygon" | "arbitrum" | "optimism" | "ethereum"
  external_url: string | null
  image_url: string | null
  previews?: {
    image_small_url: string | null
    image_medium_url: string | null
    image_large_url: string | null
  }
  collection: {
    collection_id: string // can be null due to docs but we won't fetch NFTs without collections anyway
    name: string | null
    floor_prices: {
      value: number
      payment_token: {
        name: string | null
        symbol: string | null
        decimals: number
      }
    }[]
  }
  owners: { owner_address: string; last_acquired_date: string }[]
  extra_metadata: {
    attributes?: [{ trait_type?: string | null; value?: string | null }]
  }
}

type SimpleHashCollectionModel = {
  id: string
  name: string | null
  image_url: string | null
  chain: "polygon" | "arbitrum" | "optimism" | "ethereum"
  distinct_nfts_owned: number | null
  distinct_owner_count: number | null
  distinct_nft_count: number | null
  total_quantity: number | null
  floor_prices: {
    value: number
    payment_token: {
      name: string | null
      symbol: string | null
      decimals: number
    }
  }[]
}

type SimpleHashNFTsByWalletAPIResponse = {
  next: string | null
  nfts: SimpleHashNFTModel[]
}

type SimpleHashCollectionsByWalletAPIResponse = {
  collections: SimpleHashCollectionModel[]
}

const CHAIN_ID_TO_NAME = {
  1: "ethereum",
  10: "optimism",
  137: "polygon",
  42161: "arbitrum",
  43114: "avalanche",
}

const SIMPLE_HASH_CHAIN_TO_ID = {
  ethereum: 1,
  optimism: 10,
  polygon: 137,
  arbitrum: 42161,
  avalanche: 43114,
}

function isGalxeAchievement(url: string | null | undefined) {
  return !!url && (url.includes("galaxy.eco") || url.includes("galxe.com"))
}

function getChainIDsNames(chainIDs: string[]) {
  return chainIDs
    .map(
      (chainID) =>
        CHAIN_ID_TO_NAME[parseInt(chainID, 10) as keyof typeof CHAIN_ID_TO_NAME]
    )
    .join(",")
}

function simpleHashCollectionModelToCollection(
  original: SimpleHashCollectionModel,
  owner: HexString
): NFTCollection {
  const { id, chain, floor_prices: collectionPrices } = original
  const floorPrice = collectionPrices
    ?.map(({ value, payment_token }) => ({
      value: BigInt(value),
      token: {
        name: payment_token.name || "Ether",
        symbol: payment_token.symbol || "ETH",
        decimals: payment_token.decimals,
      },
    }))
    .sort((price1, price2) => Number(price1.value - price2.value))[0]
  const chainID = SIMPLE_HASH_CHAIN_TO_ID[chain]

  return {
    id,
    name: original.name || "",
    nftCount: original.distinct_nft_count || 0,
    owner,
    thumbnail: original.image_url || "",
    network: NETWORK_BY_CHAIN_ID[chainID],
    floorPrice,
    hasBadges: false, // TODO: check how to discover if this is a Galxe collection
  }
}

function simpleHashNFTModelToNFT(
  original: SimpleHashNFTModel,
  owner: HexString
): NFT {
  const {
    nft_id: nftID,
    contract_address: contractAddress,
    chain,
    image_url: previewURL,
    previews,
    owners = [],
    external_url: nftURL = "",
    collection: { collection_id: collectionID },
    extra_metadata: metadata,
  } = original

  const isAchievement = isGalxeAchievement(nftURL)

  const thumbnail =
    previewURL ||
    previews?.image_large_url ||
    previews?.image_medium_url ||
    previews?.image_small_url ||
    ""
  const chainID = SIMPLE_HASH_CHAIN_TO_ID[chain]

  const transferDate = owners.find(({ owner_address }) =>
    sameEVMAddress(owner_address, owner)
  )?.last_acquired_date

  const attributes =
    metadata?.attributes?.flatMap(({ trait_type, value }) =>
      value && trait_type
        ? {
            value,
            trait: trait_type,
          }
        : []
    ) ?? []

  return {
    id: nftID,
    name: original.name || "",
    description: original.description || "",
    thumbnail,
    transferDate,
    attributes,
    collectionID,
    contract: contractAddress,
    owner,
    network: NETWORK_BY_CHAIN_ID[chainID],
    badge: isAchievement && nftURL ? { url: nftURL } : null,
  }
}

/**
 * Get NFT holdings of given address across collections and networks
 * using the SimpleHash API.
 *
 * Learn more at https://simplehash.readme.io/reference/nfts-by-owners
 *
 * @param address address whose NFT holdings we want to query
 * @param collectionID collections we are updating
 * @param chainIDs the networks we're querying
 */
export async function getSimpleHashNFTs(
  address: string,
  collectionID: string,
  chainIDs: string[]
): Promise<NFTsWithPagesResponse> {
  const requestURL = new URL("https://api.simplehash.com/api/v0/nfts/owners")
  requestURL.searchParams.set("chains", getChainIDsNames(chainIDs))
  requestURL.searchParams.set("wallet_addresses", address)
  requestURL.searchParams.set("collection_id", collectionID)

  try {
    const result: SimpleHashNFTsByWalletAPIResponse = await fetchJson({
      url: requestURL.toString(),
      headers: {
        "X-API-KEY": process.env.SIMPLE_HASH_API_KEY ?? "",
      },
    })

    return {
      nfts:
        result.nfts
          .filter((nft) => !!nft.nft_id)
          .map((nft) => simpleHashNFTModelToNFT(nft, address)) ?? [],
      nextPageURL: result.next,
    }
  } catch (err) {
    logger.error("Error retrieving NFTs ", err)
  }

  return { nfts: [], nextPageURL: null }
}

/**
 * Get NFT Collections of given address and networks using the SimpleHash API.
 * This will return an overview of collections that address holds.
 *
 * Learn more at https://simplehash.readme.io/reference/collections-by-wallets
 *
 * @param address address whose NFT Collections we want to query
 * @param chainIDs the networks we're querying
 */
export async function getSimpleHashCollections(
  address: string,
  chainIDs: string[]
): Promise<NFTCollection[]> {
  const requestURL = new URL(
    "https://api.simplehash.com/api/v0/nfts/collections_by_wallets"
  )
  requestURL.searchParams.set("chains", getChainIDsNames(chainIDs))
  requestURL.searchParams.set("wallet_addresses", address)

  try {
    const result: SimpleHashCollectionsByWalletAPIResponse = await fetchJson({
      url: requestURL.toString(),
      headers: {
        "X-API-KEY": process.env.SIMPLE_HASH_API_KEY ?? "",
      },
    })

    return result.collections
      .filter((collection) => collection.id)
      .map((collection) =>
        simpleHashCollectionModelToCollection(collection, address)
      )
  } catch (err) {
    logger.error("Error retrieving NFTs ", err)
  }

  return []
}
