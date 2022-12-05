import React, { ReactElement } from "react"
import { useTranslation } from "react-i18next"
import { HeaderContainer, EmptyHeader } from "./NFTsHeaderBase"
import SharedLoadingSpinner from "../Shared/SharedLoadingSpinner"

type HeaderProps = {
  loading: boolean
  nfts: number
  collections: number
  badges: number
  totalInCurrency: string
  totalInETH: string
  mainCurrencySign: string
}

export default function NFTsHeader({
  nfts,
  collections,
  badges,
  totalInCurrency,
  totalInETH,
  mainCurrencySign,
  loading,
}: HeaderProps): ReactElement {
  const { t } = useTranslation("translation", {
    keyPrefix: "nfts",
  })

  if (nfts < 1) {
    return (
      <HeaderContainer>
        <EmptyHeader />
      </HeaderContainer>
    )
  }

  return (
    <HeaderContainer>
      <div className="stats_container">
        <div className="stats_title">{t("header.title")}</div>
        <div className="stats_totals">
          <span className="currency_sign">{mainCurrencySign}</span>
          <span className="currency_total">{totalInCurrency}</span>
          {loading && (
            <SharedLoadingSpinner size="small" variant="transparent" />
          )}
        </div>
        <div className="crypto_total">{totalInETH}</div>
      </div>
      <ul className="nft_counts">
        <li>
          <strong>{collections}</strong>
          {t("units.collection", { count: collections })}
        </li>
        <li className="spacer" role="presentation" />
        <li>
          <strong>{nfts}</strong>
          {t("units.nft", { count: nfts })}
        </li>
        <li className="spacer" role="presentation" />
        <li>
          <strong>{badges}</strong>
          {t("units.badge", { count: badges })}
        </li>
      </ul>
      <style jsx>{`
        .stats_container {
          text-align: center;
          margin-bottom: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .stats_title {
          font-size: 14px;
          font-weight: 500;
          line-height: 16px;
          letter-spacing: 0.03em;
          color: var(--green-20);
        }

        .stats_totals {
          display: flex;
          flex-direction: row;
          gap: 4px;
          align-items: center;
        }

        .currency_total {
          font-size: 36px;
          font-weight: 500;
          line-height: 48px;
          letter-spacing: 0em;
          color: #fff;
        }

        .currency_sign {
          font-size: 18px;
          font-weight: 600;
          line-height: 24px;
          letter-spacing: 0em;
          color: var(--green-40);
          align-self: start;
          margin-top: 7px;
        }

        .crypto_total {
          font-size: 14px;
          font-weight: 500;
          line-height: 16px;
          letter-spacing: 0.03em;
          color: var(--green-20);
        }

        .nft_counts {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 16px;
        }

        li {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
          color: var(--green-40);
          font-weight: 600;
          font-size: 18px;
          line-height: 24px;
        }

        li strong {
          color: var(--white);
        }

        li.spacer {
          border: 0.5px solid var(--green-80);
          align-self: stretch;
        }
      `}</style>
    </HeaderContainer>
  )
}
