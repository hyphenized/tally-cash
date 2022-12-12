import React, { ReactElement } from "react"
import { isLedgerSupported } from "@tallyho/tally-background/services/ledger"
import SharedButton from "../../../components/Shared/SharedButton"
import SharedIcon from "../../../components/Shared/SharedIcon"
import OnboardingTip from "./OnboardingTip"
import OnboardingRoutes from "./Routes"

const intersperseWith = <T, K>(arr: T[], getItem: (index: number) => K) => {
  const result: (T | K)[] = []

  for (let i = 0; i < arr.length; i += 1) {
    const element = arr[i]
    result.push(element)

    if (i < arr.length - 1) result.push(getItem(i))
  }

  return result
}

const options = [
  {
    label: "Import recovery phrase",
    icon: "add_wallet/import.svg",
    url: OnboardingRoutes.IMPORT_SEED,
    isAvailable: true,
  },
  {
    label: "Connect to Ledger",
    icon: "add_wallet/ledger.svg",
    url: OnboardingRoutes.LEDGER,
    isAvailable: isLedgerSupported,
  },
  {
    label: "Read-only address",
    icon: "add_wallet/preview.svg",
    url: OnboardingRoutes.VIEW_ONLY_WALLET,
    isAvailable: true,
  },
].filter((item) => item.isAvailable)

function AddWalletRow({
  icon,
  url,
  label,
  onClick,
}: {
  icon: string
  label: string
  url?: string
  onClick?: () => void
}) {
  return (
    <SharedButton
      style={{ width: "100%" }}
      type="unstyled"
      size="medium"
      linkTo={url}
      onClick={onClick}
    >
      <div className="option">
        <div className="left">
          <SharedIcon icon={icon} width={32} color="currentColor" />
          {label}
        </div>
        <div className="icon_chevron_right" />
        <SharedIcon icon="chevron_right.svg" width={16} color="currentColor" />
      </div>
      <style jsx>{`
        .left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .option {
          display: flex;
          width: 100%;
          gap: 10px;
          justify-content: space-between;
          align-items: center;
          background-color: var(--green-95);
          font-size: 18px;
          font-weight: 600;
          color: var(--green-20);
          line-height: 24px;
        }

        .option:hover {
          color: var(--trophy-gold);
        }

        .option:hover button {
          background-color: var(--trophy-gold) !important;
        }

        .icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          margin-right: 10px;
        }
      `}</style>
    </SharedButton>
  )
}

const optionsWithSpacer = intersperseWith(options, () => "spacer" as const)

export default function AddWallet(): ReactElement {
  return (
    <section className="fadeIn">
      <header>
        <img
          width="80"
          height="80"
          alt="Tally Ho Gold"
          src="./images/doggo_gold.svg"
        />
        <div className="bottom_content">
          <h1 className="bottom_title">Use existing wallet</h1>
        </div>
      </header>
      <div className="actions_container">
        <ul>
          {optionsWithSpacer.map((option, i) => {
            if (option === "spacer") {
              const key = `option-${i}`

              return (
                <li key={key}>
                  <div role="presentation" className="spacer" />
                </li>
              )
            }

            const { label, icon, url } = option
            return (
              <li key={url}>
                <AddWalletRow icon={icon} url={url} label={label} />
              </li>
            )
          })}
        </ul>
      </div>
      <OnboardingTip>You can always add more wallets later</OnboardingTip>
      <style jsx>
        {`
          section {
            display: flex;
            flex-direction: column;
            align-items: center;
            --fade-in-duration: 300ms;
          }

          header {
            display: flex;
            flex-direction: column;
            gap: 16px;
            align-items: center;
            margin-bottom: 42px;
          }

          header img {
            border-radius: 22px;
          }

          header h1 {
            font-family: "Quincy CF";
            font-weight: 500;
            font-size: 36px;
            line-height: 42px;
            margin: 0;
          }

          ul {
            display: flex;
            flex-direction: column;
            background-color: var(--green-95);
            border-radius: 16px;
            padding: 24px;
            gap: 24px;
          }

          li {
            display: flex;
          }

          .spacer {
            width: 100%;
            border: 0.5px solid var(--green-120);
          }

          .actions_container {
            margin-bottom: 24px;
          }

          .top {
            display: flex;
            width: 100%;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 5px;
            padding-top: 68.5px;
          }

          .icon_close {
            mask-image: url("./images/close.svg");
            mask-size: cover;
            width: 11px;
            height: 11px;
            margin-right: 10px;
            margin-top: 2px;
          }

          .icon_close:hover {
            background-color: var(--green-20);
          }
        `}
      </style>
    </section>
  )
}
