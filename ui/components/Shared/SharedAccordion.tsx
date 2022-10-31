import classNames from "classnames"
import React, { ReactElement, useEffect, useRef, useState } from "react"
import SharedIcon from "./SharedIcon"

export default function SharedAccordion({
  headerElement,
  contentElement,
  contentHeight,
  isInitiallyOpen = false,
  style,
}: {
  headerElement: ReactElement
  contentElement: ReactElement
  contentHeight?: number
  isInitiallyOpen?: boolean
  style?: React.CSSProperties
}): ReactElement {
  const contentRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(isInitiallyOpen)
  const [height, setHeight] = useState(0)

  const toggle = () => setIsOpen((open) => !open)

  useEffect(() => {
    setHeight(contentHeight ?? contentRef.current?.clientHeight ?? 600)
  }, [contentRef, contentElement, contentHeight])

  return (
    <div className="accordion" style={style}>
      <div
        className="accordion_header"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && toggle()}
        onClick={toggle}
      >
        <div className="accordion_header_content">{headerElement}</div>
        <SharedIcon
          icon="icons/s/arrow-toggle.svg"
          width={16}
          color="var(--green-5)"
          hoverColor="#fff"
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          customStyles={`
            margin: 2px 0 2px 8px;
            transform: rotate(${isOpen ? "180" : "0"}deg);
            transition: transform 100ms;
          `}
        />
      </div>
      {isOpen && (
        <div
          className={classNames("accordion_content", {
            visible: isOpen,
          })}
        >
          <div ref={contentRef}>{contentElement}</div>
        </div>
      )}
      <style jsx>{`
        .accordion {
          background-color: ${isOpen ? "var(--green-120)" : ""};
        }
        .accordion_header {
          display: flex;
          align-items: center;
          padding: 4px 8px;
          cursor: pointer;
        }
        .accordion_header_content {
          flex: 1 0 auto;
        }
        .accordion_content {
          max-height: 0;
          transition: max-height 250ms ease-out;
          padding: 0 8px;
        }
        .accordion_content.visible {
          max-height: ${height + 10}px;
        }
      `}</style>
    </div>
  )
}
