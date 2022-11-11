import { FeatureFlags, isEnabled } from "@tallyho/tally-background/features"
import {
  getAccountTotal,
  selectCurrentAccountSigner,
} from "@tallyho/tally-background/redux-slices/selectors"
import {
  rejectDataSignature,
  selectTypedData,
  signTypedData,
} from "@tallyho/tally-background/redux-slices/signing"
import { ReadOnlyAccountSigner } from "@tallyho/tally-background/services/signing"
import React, { ReactElement, useState } from "react"
import { useTranslation } from "react-i18next"
import { useHistory } from "react-router-dom"
import Signing from "../components/Signing"
import SignTransactionContainer from "../components/SignTransaction/SignTransactionContainer"
import {
  useBackgroundDispatch,
  useBackgroundSelector,
  useIsSignerLocked,
} from "../hooks"
import SignDataDetailPanel from "./SignDataDetailPanel"

export enum SignDataType {
  TypedData = "sign-typed-data",
}

export default function SignData(): ReactElement {
  const { t } = useTranslation("translation", {
    keyPrefix: "signTransaction.signTypedData",
  })
  const dispatch = useBackgroundDispatch()
  const typedDataRequest = useBackgroundSelector(selectTypedData)

  const history = useHistory()

  const signerAccountTotal = useBackgroundSelector((state) => {
    if (typeof typedDataRequest !== "undefined") {
      return getAccountTotal(state, typedDataRequest.account)
    }
    return undefined
  })

  const currentAccountSigner = useBackgroundSelector(selectCurrentAccountSigner)

  const [isTransactionSigning, setIsTransactionSigning] = useState(false)

  const isLocked = useIsSignerLocked(currentAccountSigner)

  if (isEnabled(FeatureFlags.USE_UPDATED_SIGNING_UI)) {
    if (currentAccountSigner === null || typedDataRequest === undefined) {
      return <></>
    }

    return <Signing request={typedDataRequest} />
  }

  if (isLocked) return <></>

  const canConfirm =
    typedDataRequest !== undefined &&
    currentAccountSigner &&
    currentAccountSigner !== ReadOnlyAccountSigner

  const handleConfirm = () => {
    if (canConfirm) {
      dispatch(
        signTypedData({
          request: typedDataRequest,
          accountSigner: currentAccountSigner,
        })
      )
      setIsTransactionSigning(true)
    }

    // We need to send user to the previous page after signing data is completed
    history.goBack()
  }

  const handleReject = async () => {
    await dispatch(rejectDataSignature())
    history.goBack()
  }

  const getTitle = () => {
    if (typedDataRequest?.typedData.primaryType === "PermitAndTransferFrom") {
      return t("authorizeDeposit")
    }
    return t("signMessage", {
      messageType: typedDataRequest?.typedData.primaryType ?? "Message",
    })
  }

  return (
    <SignTransactionContainer
      signerAccountTotal={signerAccountTotal}
      confirmButtonLabel={t("confirmButtonLabel")}
      canConfirm={canConfirm}
      handleConfirm={handleConfirm}
      handleReject={handleReject}
      title={getTitle()}
      detailPanel={<SignDataDetailPanel />}
      reviewPanel={<SignDataDetailPanel />}
      isTransactionSigning={isTransactionSigning}
      extraPanel={null}
      isArbitraryDataSigningRequired={false}
    />
  )
}
