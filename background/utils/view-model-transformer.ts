import { pick } from "lodash"

export const transactionPropertiesForUI = [
  "hash",
  "from",
  "fromTruncated",
  "to",
  "toTruncated",
  "infoRows",
  "asset.symbol",
  "asset.decimals",
  "value",
  "localizedDecimalValue",
  "blockHeight",
  "blockHash",
  "status",
  "network.chainID",
  "network.name",
  "network.baseAsset.symbol",
  "maxFeePerGas",
  "gasPrice",
  "gasUsed",
  "nonce",
  "annotation.blockTimestamp",
  "annotation.type",
  "annotation.source",
  "annotation.contractInfo.annotation.nameRecord.resolved.nameOnNetwork",
  "annotation.contractInfo.annotation.nameRecord.resolved.nameOnNetwork.name",
  "annotation.contractInfo.annotation.nameRecord.system",
  "annotation.recipient.address",
  "annotation.recipient.network",
  "annotation.recipient.annotation",
  "annotation.recipient.annotation.nonce",
  "annotation.recipient.annotation.balance",
  "annotation.recipient.annotation.nameRecord.resolved.nameOnNetwork",
  "annotation.recipient.annotation.nameRecord.resolved.nameOnNetwork.name",
  "annotation.recipient.annotation.nameRecord.system",
  "annotation.sender.address",
  "annotation.sender.network",
  "annotation.sender.annotation",
  "annotation.sender.annotation.nonce",
  "annotation.sender.annotation.balance",
  "annotation.sender.annotation.nameRecord.resolved.nameOnNetwork",
  "annotation.sender.annotation.nameRecord.resolved.nameOnNetwork.name",
  "annotation.sender.annotation.nameRecord.system",
  "annotation.spender.address",
  "annotation.spender.network",
  "annotation.spender.annotation",
  "annotation.spender.annotation.nonce",
  "annotation.spender.annotation.balance",
  "annotation.spender.annotation.nameRecord.nameOnNetwork",
  "annotation.spender.annotation.nameRecord.nameOnNetwork.name",
  "annotation.spender.annotation.nameRecord.system",
  "annotation.contractName",
  "annotation.transactionLogoURL",
  "annotation.assetAmount",
  "annotation.displayFields",
  "annotation.assetAmount.asset.symbol",
  "annotation.assetAmount.amount",
  "annotation.assetAmount.localizedDecimalAmount",
  "annotation.fromAssetAmount.asset.symbol",
  "annotation.toAssetAmount.asset.symbol",
]

export function filterTransactionPropsForUI<T>(transactionData: {
  transaction: T
  forAccounts: string[]
}): { transaction: T; forAccounts: string[] } {
  return {
    transaction: pick(transactionData.transaction, transactionPropertiesForUI),
    forAccounts: transactionData.forAccounts,
  } as { transaction: T; forAccounts: string[] }
}
