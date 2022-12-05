import React from "react"
import { initialState } from "@tallyho/tally-background/redux-slices/keyrings"
import SharedCurrentAccountInformation from "../SharedCurrentAccountInformation"
import { renderWithProviders } from "../../../tests/test-utils"

const name = "Name"
const shortenedAddress = "0x208e…090cd"
const keyringId = "keyring"
const lock = "lock"
const unlock = "unlock"

describe("SharedCurrentAccountInformation", () => {
  test("should display name", () => {
    const ui = renderWithProviders(
      <SharedCurrentAccountInformation
        name={name}
        shortenedAddress=""
        avatarURL={undefined}
      />
    )

    expect(ui.getByText(name)).toBeInTheDocument()
  })

  test("should display shortened address when name is undefined", () => {
    const ui = renderWithProviders(
      <SharedCurrentAccountInformation
        name={undefined}
        shortenedAddress={shortenedAddress}
        avatarURL={undefined}
      />
    )

    expect(ui.getByText(shortenedAddress)).toBeInTheDocument()
  })

  test("should not display keyring", () => {
    const ui = renderWithProviders(
      <SharedCurrentAccountInformation
        name={name}
        shortenedAddress=""
        avatarURL={undefined}
        showKeyring={false}
      />
    )

    const keyringElement = ui.queryByTestId(keyringId)
    expect(keyringElement).not.toBeInTheDocument()
  })

  test("should display lock keyring", () => {
    const ui = renderWithProviders(
      <SharedCurrentAccountInformation
        name={name}
        shortenedAddress=""
        avatarURL={undefined}
        showKeyring
      />
    )
    const keyringElement = ui.getByTestId(keyringId)
    expect(keyringElement).toBeInTheDocument()
    expect(keyringElement.firstChild).toHaveStyle(
      `mask-image: url("./images/icons/s/${lock}-bold.svg")`
    )
  })

  test("should display unlock keyring", () => {
    const ui = renderWithProviders(
      <SharedCurrentAccountInformation
        name={name}
        shortenedAddress=""
        avatarURL={undefined}
        showKeyring
      />,
      {
        preloadedState: {
          keyrings: {
            ...initialState,
            status: "unlocked",
          },
        },
      }
    )
    const keyringElement = ui.getByTestId(keyringId)
    expect(keyringElement).toBeInTheDocument()
    expect(keyringElement.firstChild).toHaveStyle(
      `mask-image: url("./images/icons/s/${unlock}-bold.svg")`
    )
  })
})
