type OldState = {
  ui: {
    [sliceKey: string]: unknown
  }
  [otherSlice: string]: unknown
}

type NewState = {
  ui: {
    accountSignerSettings: Array<{
      signer: unknown
      title?: string
    }>
    [sliceKey: string]: unknown
  }
  [otherSlice: string]: unknown
}

export default (oldState: Record<string, unknown>): NewState => {
  const prevState = oldState as OldState

  const { ui } = prevState

  return { ...prevState, ui: { ...ui, accountSignerSettings: [] } }
}
