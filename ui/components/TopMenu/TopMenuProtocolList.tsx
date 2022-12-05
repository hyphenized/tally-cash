import React, { ReactElement } from "react"
import {
  ARBITRUM_NOVA,
  ARBITRUM_ONE,
  AVALANCHE,
  ETHEREUM,
  GOERLI,
  OPTIMISM,
  POLYGON,
  ROOTSTOCK,
} from "@tallyho/tally-background/constants"
import { FeatureFlags, isEnabled } from "@tallyho/tally-background/features"
import { sameNetwork } from "@tallyho/tally-background/networks"
import { selectCurrentNetwork } from "@tallyho/tally-background/redux-slices/selectors"
import { selectShowTestNetworks } from "@tallyho/tally-background/redux-slices/ui"
import { useTranslation } from "react-i18next"
import { useBackgroundSelector } from "../../hooks"
import TopMenuProtocolListItem from "./TopMenuProtocolListItem"
import { i18n } from "../../_locales/i18n"

const productionNetworks = [
  {
    network: ETHEREUM,
    info: i18n.t("protocol.mainnet"),
  },
  {
    network: POLYGON,
    info: i18n.t("protocol.l2"),
  },
  {
    network: OPTIMISM,
    info: i18n.t("protocol.l2"),
  },
  {
    network: ARBITRUM_ONE,
    info: i18n.t("protocol.l2"),
    isDisabled: false,
  },
  ...(isEnabled(FeatureFlags.SUPPORT_RSK)
    ? [
        {
          network: ROOTSTOCK,
          info: i18n.t("protocol.beta"),
        },
      ]
    : []),
  ...(isEnabled(FeatureFlags.SUPPORT_AVALANCHE)
    ? [
        {
          network: AVALANCHE,
          info: i18n.t("protocol.avalanche"),
        },
      ]
    : [
        {
          network: AVALANCHE,
          info: i18n.t("comingSoon"),
          isDisabled: true,
        },
      ]),

  ...(isEnabled(FeatureFlags.SUPPORT_ARBITRUM_NOVA)
    ? [
        {
          network: ARBITRUM_NOVA,
          info: i18n.t("protocol.mainnet"),
        },
      ]
    : [
        {
          network: ARBITRUM_NOVA,
          info: i18n.t("comingSoon"),
          isDisabled: true,
        },
      ]),

  // {
  //   name: "Binance Smart Chain",
  //   info: i18n.t("protocol.compatibleChain"),
  //   width: 24,
  //   height: 24,
  // },
  // {
  //   name: "Celo",
  //   info: "Global payments infrastructure",
  //   width: 24,
  //   height: 24,
  // },
]

const testNetworks = [
  {
    network: GOERLI,
    info: i18n.t("protocol.testnet"),
    isDisabled: false,
  },
]

interface TopMenuProtocolListProps {
  onProtocolChange: () => void
}

export default function TopMenuProtocolList({
  onProtocolChange,
}: TopMenuProtocolListProps): ReactElement {
  const { t } = useTranslation()
  const currentNetwork = useBackgroundSelector(selectCurrentNetwork)
  const showTestNetworks = useBackgroundSelector(selectShowTestNetworks)

  return (
    <div className="standard_width_padded center_horizontal">
      <ul>
        {productionNetworks.map((info) => (
          <TopMenuProtocolListItem
            isSelected={sameNetwork(currentNetwork, info.network)}
            key={info.network.name}
            network={info.network}
            info={info.info}
            onSelect={onProtocolChange}
            isDisabled={info.isDisabled ?? false}
          />
        ))}
        {showTestNetworks && testNetworks.length > 0 && (
          <>
            <li className="protocol_divider">
              <div className="divider_label">
                {t("topMenu.protocolList.testnetsSectionTitle")}
              </div>
              <div className="divider_line" />
            </li>
            {testNetworks.map((info) => (
              <TopMenuProtocolListItem
                isSelected={sameNetwork(currentNetwork, info.network)}
                key={info.network.name}
                network={info.network}
                info={info.info}
                onSelect={onProtocolChange}
                isDisabled={info.isDisabled ?? false}
              />
            ))}
          </>
        )}
      </ul>
      <style jsx>
        {`
          .protocol_divider {
            display: flex;
            align-items: center;
            margin-bottom: 16px;
            margin-top: 32px;
          }
          .divider_line {
            width: 286px;
            border-bottom-color: var(--green-120);
            border-bottom-style: solid;
            border-bottom-width: 1px;
            margin-left: 19px;
            position: absolute;
            right: 0px;
          }
          .divider_label {
            color: var(--green-40);
            font-size: 16px;
            font-weight: 500;
            line-height: 24px;
          }
        `}
      </style>
    </div>
  )
}
