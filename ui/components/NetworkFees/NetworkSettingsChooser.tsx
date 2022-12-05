/* eslint-disable no-nested-ternary */
import React, { ReactElement, useState } from "react"
import {
  EstimatedFeesPerGas,
  NetworkFeeSettings,
  setFeeType,
} from "@tallyho/tally-background/redux-slices/transaction-construction"
import {
  selectDefaultNetworkFeeSettings,
  selectTransactionData,
} from "@tallyho/tally-background/redux-slices/selectors/transactionConstructionSelectors"
import {
  ARBITRUM_ONE,
  OPTIMISM,
  ROOTSTOCK,
} from "@tallyho/tally-background/constants"
import { useBackgroundDispatch, useBackgroundSelector } from "../../hooks"
import NetworkSettingsSelect from "./NetworkSettingsSelect"
import NetworkSettingsOptimism from "./NetworkSettingsSelectOptimism"
import NetworkSettingsRSK from "./NetworkSettingsSelectRSK"
import NetworkSettingsSelectArbitrum from "./NetworkSettingsSelectArbitrum"

interface NetworkSettingsChooserProps {
  estimatedFeesPerGas: EstimatedFeesPerGas | undefined
  onNetworkSettingsSave: (setting: NetworkFeeSettings) => void
}

export default function NetworkSettingsChooser({
  estimatedFeesPerGas,
  onNetworkSettingsSave,
}: NetworkSettingsChooserProps): ReactElement {
  const [networkSettings, setNetworkSettings] = useState(
    useBackgroundSelector(selectDefaultNetworkFeeSettings)
  )
  const transactionDetails = useBackgroundSelector(selectTransactionData)

  const dispatch = useBackgroundDispatch()

  const saveNetworkSettings = async () => {
    await dispatch(setFeeType(networkSettings.feeType))
    onNetworkSettingsSave(networkSettings)
  }

  function networkSettingsSelectorFinder() {
    if (transactionDetails) {
      if (transactionDetails.network.name === OPTIMISM.name) {
        return <NetworkSettingsOptimism />
      }
      if (transactionDetails.network.name === ROOTSTOCK.name) {
        return <NetworkSettingsRSK />
      }
      if (transactionDetails.network.name === ARBITRUM_ONE.name) {
        return (
          <NetworkSettingsSelectArbitrum
            estimatedFeesPerGas={estimatedFeesPerGas}
            networkSettings={networkSettings}
            onNetworkSettingsChange={setNetworkSettings}
            onSave={saveNetworkSettings}
          />
        )
      }
      return (
        <NetworkSettingsSelect
          estimatedFeesPerGas={estimatedFeesPerGas}
          networkSettings={networkSettings}
          onNetworkSettingsChange={setNetworkSettings}
          onSave={saveNetworkSettings}
        />
      )
    }

    return <></>
  }

  return (
    <>
      <div className="wrapper">{networkSettingsSelectorFinder()}</div>
      <style jsx>
        {`
          .wrapper {
            height: 100%;
            display: flex;
            flex-flow: column;
            margin-left: 12px;
            align-items: center;
          }
        `}
      </style>
    </>
  )
}
