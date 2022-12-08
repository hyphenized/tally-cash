import React, { ReactElement, useCallback, useEffect, useState } from "react"
import { importKeyring } from "@tallyho/tally-background/redux-slices/keyrings"
import { useHistory } from "react-router-dom"
import { isValidMnemonic } from "@ethersproject/hdnode"
import { FeatureFlags, isEnabled } from "@tallyho/tally-background/features"
import SharedButton from "../../../components/Shared/SharedButton"
import OnboardingDerivationPathSelect from "../../../components/Onboarding/OnboardingDerivationPathSelect"
import {
  useBackgroundDispatch,
  useBackgroundSelector,
  useAreKeyringsUnlocked,
} from "../../../hooks"

type Props = {
  nextPage: string
}

export default function ImportSeed(props: Props): ReactElement {
  const { nextPage } = props

  const areKeyringsUnlocked = useAreKeyringsUnlocked(false)

  const [recoveryPhrase, setRecoveryPhrase] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [path, setPath] = useState<string>("m/44'/60'/0'/0")
  const [isImporting, setIsImporting] = useState(false)

  const dispatch = useBackgroundDispatch()
  const keyringImport = useBackgroundSelector(
    (state) => state.keyrings.importing
  )

  const history = useHistory()

  useEffect(() => {
    if (areKeyringsUnlocked && keyringImport === "done" && isImporting) {
      setIsImporting(false)
      history.push(nextPage)
    }
  }, [history, areKeyringsUnlocked, keyringImport, nextPage, isImporting])

  const importWallet = useCallback(async () => {
    const plainRecoveryPhrase = recoveryPhrase
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
    const splitTrimmedRecoveryPhrase = plainRecoveryPhrase.split(" ")
    if (
      splitTrimmedRecoveryPhrase.length !== 12 &&
      splitTrimmedRecoveryPhrase.length !== 24
    ) {
      setErrorMessage("Must be a 12 or 24 word recovery phrase")
    } else if (isValidMnemonic(plainRecoveryPhrase)) {
      setIsImporting(true)
      dispatch(
        importKeyring({
          mnemonic: plainRecoveryPhrase,
          path,
          source: "import",
        })
      )
    } else {
      setErrorMessage("Invalid recovery phrase")
    }
  }, [dispatch, recoveryPhrase, path])

  if (!areKeyringsUnlocked) return <></>

  return (
    <>
      <div className="content fadeIn">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            importWallet()
          }}
        >
          <div className="portion top">
            <div className="illustration_import" />
            <h1 className="serif_header">Import secret recovery phrase</h1>
            <div className="info">
              Copy paste or write down a 12 or 24 word secret recovery phrase.
            </div>
            <div className="input_wrap">
              <div
                id="recovery_phrase"
                role="textbox"
                aria-label="Recovery phrase"
                tabIndex={0}
                contentEditable
                data-empty={recoveryPhrase.length < 1}
                spellCheck="false"
                onInput={(e) => {
                  setRecoveryPhrase(e.currentTarget.innerText.trim())
                }}
              />
              <div className="recovery_label">Paste secret recovery seed</div>
              {errorMessage && <p className="error">{errorMessage}</p>}
            </div>
            {!isEnabled(FeatureFlags.HIDE_IMPORT_DERIVATION_PATH) && (
              <div className="select_wrapper">
                <OnboardingDerivationPathSelect onChange={setPath} />
              </div>
            )}
          </div>
          <div className="portion bottom">
            <SharedButton
              style={{ width: "100%", maxWidth: "300px" }}
              size={
                isEnabled(FeatureFlags.HIDE_IMPORT_DERIVATION_PATH)
                  ? "medium"
                  : "large"
              }
              type="primary"
              isDisabled={!recoveryPhrase || isImporting}
              onClick={importWallet}
              center
            >
              Import account
            </SharedButton>
            {!isEnabled(FeatureFlags.HIDE_IMPORT_DERIVATION_PATH) && (
              <button
                className="help_button"
                type="button"
                // TODO External link or information modal?
                onClick={() => {}}
              >
                How do I find the recovery phrase?
              </button>
            )}
          </div>
        </form>
      </div>
      <style jsx>{`
        form {
          all: unset;
        }

        .content {
          display: flex;
          align-items: center;
          flex-direction: column;
          justify-content: space-between;
        }

        h1 {
          margin: unset;
        }
        .portion {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .bottom {
          justify-content: space-between;
          flex-direction: column;
          margin-top: ${isEnabled(FeatureFlags.HIDE_IMPORT_DERIVATION_PATH)
            ? "48px"
            : "24px"};
          margin-bottom: ${isEnabled(FeatureFlags.HIDE_IMPORT_DERIVATION_PATH)
            ? "24px"
            : "16px"};
        }
        .illustration_import {
          background: url("./images/doggo_import.svg");
          background-size: cover;
          width: 85px;
          height: 83px;
          margin-bottom: 15px;
        }
        .serif_header {
          font-size: 36px;
          line-height: 42px;
          margin-bottom: 8px;
        }

        .info {
          margin-bottom: 40.5px;
        }

        .info,
        .help_button {
          width: 320px;
          text-align: center;
          font-size: 16px;
          line-height: 24px;
          color: var(--green-40);
          font-weight: 500;
        }
        .help_button {
          margin-top: 16px;
        }
        .checkbox_wrapper {
          margin-top: 6px;
          margin-bottom: 6px;
        }
        .select_wrapper {
          margin-top: ${errorMessage ? "4px" : "15px"};
          width: 320px;
        }
        .input_wrap {
          position: relative;
        }

        .recovery_label {
          position: absolute;
          font-size: 12px;
          line-height: 16px;
          transition: all 0.2s ease-in-out;
        }

        #recovery_phrase[data-empty="true"]:not(:focus) ~ .recovery_label {
          font-size: 16px;
          line-height: 24px;
          top: 12px;
          left: 16px;
        }

        #recovery_phrase[data-empty="false"] ~ .recovery_label {
          padding: 0 6px;
          color: var(--green-40);
          background: var(--hunter-green);
          top: -8px;
          left: 16px;
        }

        #recovery_phrase {
          width: 320px;
          height: 200px;
          border-radius: 4px;
          border: 2px solid var(--green-60);
          padding: 12px 16px;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: var(--white);
          font-family: inherit;
          overflow-y: scroll;
        }

        #recovery_phrase * {
          word-wrap: break-word;
          color: var(--white);
          font-family: inherit;
        }

        #recovery_phrase:focus ~ .recovery_label {
          top: -8px;
          left: 16px;
          padding: 0 6px;
          color: var(--trophy-gold);
          background: var(--hunter-green);
          transition: all 0.2s ease-in-out;
          z-index: 999;
        }

        #recovery_phrase:focus {
          border: 2px solid var(--trophy-gold);
          outline: 0;
          background: var(--hunter-green);
        }

        .error {
          color: red;
        }
      `}</style>
    </>
  )
}
