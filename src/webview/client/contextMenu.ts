import { state, vscode } from "./state"

interface MenuItem {
  label: string
  action?: () => void
  /** Reason the item is unavailable; shown as a tooltip when disabled. */
  disabled?: string
  separator?: boolean
}

let menu: HTMLDivElement | null = null

export function closeContextMenu() {
  menu?.remove()
  menu = null
}

function build(items: MenuItem[], x: number, y: number) {
  closeContextMenu()

  const element = document.createElement("div")
  element.className = "context-menu"

  for (const item of items) {
    if (item.separator) {
      const separator = document.createElement("div")
      separator.className = "sep"
      element.appendChild(separator)
      continue
    }

    const button = document.createElement("button")
    button.type = "button"
    button.textContent = item.label
    if (item.disabled) {
      button.disabled = true
      button.title = item.disabled
    } else {
      button.onclick = () => {
        closeContextMenu()
        item.action?.()
      }
    }
    element.appendChild(button)
  }

  document.body.appendChild(element)

  // Flip the menu back on screen when opened near an edge.
  const rect = element.getBoundingClientRect()
  const left = Math.min(x, window.innerWidth - rect.width - 8)
  const top = Math.min(y, window.innerHeight - rect.height - 8)
  element.style.left = `${Math.max(4, left)}px`
  element.style.top = `${Math.max(4, top)}px`

  element.addEventListener("mousedown", (event) => event.stopPropagation())
  menu = element
}

function send(kind: string, at: number, count: number) {
  vscode.postMessage({ type: "structural", payload: { kind, at, count } })
}

/**
 * The row band a header operation applies to.
 *
 * Only a *whole-row* selection (one spanning every column) counts as a
 * multi-row target. A plain cell range that happens to cover several rows would
 * otherwise silently turn "insert a row" into "insert five", and a full-row
 * selection spans all columns, which would do the same to column operations.
 */
function selectedRowSpan(): { start: number; count: number } | null {
  const fullRows = state.ranges.filter(
    (range) =>
      Math.min(range.startCol, range.endCol) === 0 &&
      Math.max(range.startCol, range.endCol) >= state.headers.length - 1,
  )
  if (fullRows.length === 0) return null

  let min = Infinity
  let max = -Infinity
  for (const range of fullRows) {
    min = Math.min(min, range.startRow, range.endRow)
    max = Math.max(max, range.startRow, range.endRow)
  }
  return { start: min, count: max - min + 1 }
}

/** The column band a header operation applies to; whole columns only. */
function selectedColSpan(): { start: number; count: number } | null {
  const fullCols = state.ranges.filter(
    (range) =>
      Math.min(range.startRow, range.endRow) === 0 &&
      Math.max(range.startRow, range.endRow) >= state.totalRows - 1,
  )
  if (fullCols.length === 0) return null

  let min = Infinity
  let max = -Infinity
  for (const range of fullCols) {
    min = Math.min(min, range.startCol, range.endCol)
    max = Math.max(max, range.startCol, range.endCol)
  }
  return { start: min, count: max - min + 1 }
}

const plural = (count: number, noun: string) =>
  count === 1 ? noun : `${count} ${noun}s`

const SORTED_OR_FILTERED =
  "Clear the sort and filters to change rows and columns"

export function openRowMenu(row: number, x: number, y: number) {
  const span = selectedRowSpan()
  // Right-clicking outside the selection acts on the row under the cursor.
  const target =
    span && row >= span.start && row < span.start + span.count
      ? span
      : { start: row, count: 1 }
  const blocked = state.canEditStructure ? undefined : SORTED_OR_FILTERED

  build(
    [
      {
        label: `Insert ${plural(target.count, "row")} above`,
        disabled: blocked,
        action: () => send("insertRows", target.start, target.count),
      },
      {
        label: `Insert ${plural(target.count, "row")} below`,
        disabled: blocked,
        action: () =>
          send("insertRows", target.start + target.count, target.count),
      },
      { label: "", separator: true },
      {
        label: `Delete ${plural(target.count, "row")}`,
        disabled: blocked,
        action: () => send("deleteRows", target.start, target.count),
      },
      { label: "", separator: true },
      {
        label: "Clear contents",
        action: () =>
          vscode.postMessage({ type: "clipboard", payload: { action: "clear" } }),
      },
    ],
    x,
    y,
  )
}

export function openColumnMenu(col: number, x: number, y: number) {
  const span = selectedColSpan()
  const target =
    span && col >= span.start && col < span.start + span.count
      ? span
      : { start: col, count: 1 }
  const blocked = state.canEditStructure ? undefined : SORTED_OR_FILTERED

  build(
    [
      {
        label: `Insert ${plural(target.count, "column")} left`,
        disabled: blocked,
        action: () => send("insertCols", target.start, target.count),
      },
      {
        label: `Insert ${plural(target.count, "column")} right`,
        disabled: blocked,
        action: () =>
          send("insertCols", target.start + target.count, target.count),
      },
      { label: "", separator: true },
      {
        label: `Delete ${plural(target.count, "column")}`,
        disabled: blocked,
        action: () => send("deleteCols", target.start, target.count),
      },
      { label: "", separator: true },
      {
        label: "Sort A to Z",
        action: () =>
          vscode.postMessage({
            type: "sort",
            payload: { column: target.start, direction: "asc" },
          }),
      },
      {
        label: "Sort Z to A",
        action: () =>
          vscode.postMessage({
            type: "sort",
            payload: { column: target.start, direction: "desc" },
          }),
      },
    ],
    x,
    y,
  )
}

export function openCellMenu(x: number, y: number) {
  build(
    [
      {
        label: "Cut",
        action: () =>
          vscode.postMessage({ type: "clipboard", payload: { action: "cut" } }),
      },
      {
        label: "Copy",
        action: () =>
          vscode.postMessage({ type: "clipboard", payload: { action: "copy" } }),
      },
      {
        label: "Paste",
        action: () =>
          vscode.postMessage({ type: "clipboard", payload: { action: "paste" } }),
      },
      { label: "", separator: true },
      {
        label: "Clear contents",
        action: () =>
          vscode.postMessage({ type: "clipboard", payload: { action: "clear" } }),
      },
      {
        label: "Remove fill colour",
        action: () =>
          vscode.postMessage({ type: "style", payload: { type: "clearFill" } }),
      },
      {
        label: "Clear formatting",
        action: () =>
          vscode.postMessage({
            type: "style",
            payload: { type: "clearFormat" },
          }),
      },
    ],
    x,
    y,
  )
}
