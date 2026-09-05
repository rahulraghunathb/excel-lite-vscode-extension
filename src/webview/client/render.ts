import {
  DEFAULT_ROW_HEIGHT,
  OVERSCAN,
  columnWidth,
  state,
  vscode,
} from "./state"
import { getColumnLetter } from "../../model"

export const dom = {
  grid: document.getElementById("grid") as HTMLDivElement,
  body: document.getElementById("gridBody") as HTMLTableSectionElement,
  headRow: document.getElementById("headRow") as HTMLTableRowElement,
  colLetters: document.getElementById("colLetters") as HTMLTableRowElement,
  loading: document.getElementById("loading") as HTMLDivElement,
  sheetTabs: document.getElementById("sheetTabs") as HTMLDivElement,
  sheetName: document.getElementById("sheetName") as HTMLSpanElement,
  selInfo: document.getElementById("selInfo") as HTMLDivElement,
  agg: document.getElementById("agg") as HTMLDivElement,
  rowCount: document.getElementById("rowCount") as HTMLSpanElement,
}

/** Uniform row height keeps virtualised scroll offsets exact. */
export let uniformRowHeight = DEFAULT_ROW_HEIGHT

export function setUniformRowHeight(height: number) {
  uniformRowHeight = height
}

function widthStyle(col: number): string {
  const w = columnWidth(col)
  return `width:${w}px;min-width:${w}px;max-width:${w}px;`
}

/** Header rows are rebuilt only when the columns or sort actually change. */
export function renderHeaders() {
  const cols = state.headers.length

  let letters = '<th class="corner" style="width:52px;min-width:52px;max-width:52px"></th>'
  for (let i = 0; i < cols; i++) {
    letters +=
      `<th class="col-letter" data-col="${i}" style="${widthStyle(i)}">` +
      `${getColumnLetter(i)}<div class="col-resizer" data-col="${i}"></div></th>`
  }
  dom.colLetters.innerHTML = letters

  let head = '<th id="selectAll" class="corner" style="width:52px;min-width:52px;max-width:52px">#</th>'
  for (let i = 0; i < cols; i++) {
    const sorted =
      state.sort && state.sort.column === i && state.sort.direction !== "none"
        ? state.sort.direction === "asc"
          ? " sorted-asc"
          : " sorted-desc"
        : ""
    const filtered = state.activeFilters.has(i) ? " filtered" : ""
    head +=
      `<th class="header-cell${sorted}${filtered}" data-col="${i}" style="${widthStyle(i)}">` +
      `<span class="header-text" title="${escapeAttr(state.headers[i])}">${escapeHtml(state.headers[i])}</span>` +
      `<span class="filter-icon" data-col="${i}" title="Sort and filter">▼</span>` +
      `<div class="col-resizer" data-col="${i}"></div></th>`
  }
  dom.headRow.innerHTML = head
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;")
}

/** Find-and-replace highlighting for the current window. */
function isMatch(row: number, col: number): string {
  if (state.matches.length === 0) return ""
  const currentMatch = state.currentMatch
  if (currentMatch && currentMatch.row === row && currentMatch.col === col) {
    return " match match-current"
  }
  return state.matches.some((m) => m.row === row && m.col === col)
    ? " match"
    : ""
}

function isSelected(row: number, col: number): boolean {
  for (const range of state.ranges) {
    if (
      row >= Math.min(range.startRow, range.endRow) &&
      row <= Math.max(range.startRow, range.endRow) &&
      col >= Math.min(range.startCol, range.endCol) &&
      col <= Math.max(range.startCol, range.endCol)
    ) {
      return true
    }
  }
  return false
}

/**
 * Render the current window plus spacer rows standing in for everything above
 * and below it, so the DOM holds a screenful of cells instead of the sheet.
 */
export function renderBody() {
  const cols = state.headers.length
  const start = state.windowStart
  const rows = state.windowRows

  const before = start * uniformRowHeight
  const after = Math.max(0, (state.totalRows - start - rows.length) * uniformRowHeight)

  const parts: string[] = []
  if (before > 0) {
    parts.push(`<tr class="spacer" style="height:${before}px"><td colspan="${cols + 1}"></td></tr>`)
  }

  for (let i = 0; i < rows.length; i++) {
    const viewRow = start + i
    const originalRow = state.windowOriginalIndices[i]
    parts.push(
      `<tr style="height:${uniformRowHeight}px">` +
        `<td class="row-header" data-row="${viewRow}">${(originalRow ?? viewRow) + 1}` +
        `<div class="row-resizer"></div></td>`,
    )

    const rowData = rows[i]
    for (let col = 0; col < cols; col++) {
      const style = state.windowStyles[`${viewRow},${col}`]
      let css = widthStyle(col)
      if (style?.bold) css += "font-weight:bold;"
      if (style?.italic) css += "font-style:italic;"
      if (style?.underline) css += "text-decoration:underline;"
      if (style?.align) css += `text-align:${style.align};`
      // Colours are hex-validated in the extension host before they get here.
      if (style?.bgColor) css += `background-color:${style.bgColor};`
      if (style?.fontColor) css += `color:${style.fontColor};`

      const selected = isSelected(viewRow, col) ? " selected" : ""
      const matched = isMatch(viewRow, col)
      const isCursor =
        state.cursor && state.cursor.r === viewRow && state.cursor.c === col
          ? " cursor"
          : ""
      const text = rowData[col] ?? ""
      // An explicit alignment wins over the automatic numeric right-align.
      const numeric =
        !style?.align && text !== "" && !isNaN(Number(text)) ? " numeric" : ""

      parts.push(
        `<td class="cell${selected}${isCursor}${numeric}${matched}" data-row="${viewRow}" data-col="${col}" style="${css}">` +
          escapeHtml(text) +
          "</td>",
      )
    }
    parts.push("</tr>")
  }

  if (after > 0) {
    parts.push(`<tr class="spacer" style="height:${after}px"><td colspan="${cols + 1}"></td></tr>`)
  }

  dom.body.innerHTML = parts.join("")
  updateHeaderSelectionState()
}

/** Highlight column/row headers covered by the selection. */
function updateHeaderSelectionState() {
  const colSelected = new Set<number>()
  let fullColumns = false
  for (const range of state.ranges) {
    const top = Math.min(range.startRow, range.endRow)
    const bottom = Math.max(range.startRow, range.endRow)
    if (top === 0 && bottom >= state.totalRows - 1) fullColumns = true
    for (
      let c = Math.min(range.startCol, range.endCol);
      c <= Math.max(range.startCol, range.endCol);
      c++
    ) {
      colSelected.add(c)
    }
  }

  dom.headRow.querySelectorAll<HTMLElement>("th[data-col]").forEach((th) => {
    const col = Number(th.dataset.col)
    th.classList.toggle("col-selected", fullColumns && colSelected.has(col))
  })
  dom.colLetters.querySelectorAll<HTMLElement>("th[data-col]").forEach((th) => {
    const col = Number(th.dataset.col)
    th.classList.toggle("col-selected", fullColumns && colSelected.has(col))
  })

  dom.body.querySelectorAll<HTMLElement>("td.row-header").forEach((cell) => {
    const row = Number(cell.dataset.row)
    const full = state.ranges.some(
      (range) =>
        row >= Math.min(range.startRow, range.endRow) &&
        row <= Math.max(range.startRow, range.endRow) &&
        Math.min(range.startCol, range.endCol) === 0 &&
        Math.max(range.startCol, range.endCol) >= state.headers.length - 1,
    )
    cell.classList.toggle("row-selected", full)
  })
}

/**
 * Repaint selection classes without rebuilding the DOM.
 *
 * Drag-select used to run a full-grid querySelectorAll on every mousemove; this
 * only touches the rows currently materialised.
 */
export function refreshSelectionClasses() {
  dom.body.querySelectorAll<HTMLElement>("td.cell").forEach((cell) => {
    const row = Number(cell.dataset.row)
    const col = Number(cell.dataset.col)
    cell.classList.toggle("selected", isSelected(row, col))
    cell.classList.toggle(
      "cursor",
      !!state.cursor && state.cursor.r === row && state.cursor.c === col,
    )
    const matched = isMatch(row, col)
    cell.classList.toggle("match", matched !== "")
    cell.classList.toggle("match-current", matched.includes("match-current"))
  })
  updateHeaderSelectionState()
}

/** Which rows the viewport needs right now, including overscan. */
export function visibleRange(): { start: number; count: number } {
  const scrollTop = dom.grid.scrollTop
  const height = dom.grid.clientHeight || 600
  const first = Math.max(0, Math.floor(scrollTop / uniformRowHeight) - OVERSCAN)
  const visible = Math.ceil(height / uniformRowHeight) + OVERSCAN * 2
  return {
    start: first,
    count: Math.min(visible, Math.max(0, state.totalRows - first)),
  }
}

/** Ask the host for rows if the viewport has moved outside what we hold. */
export function ensureWindow(force = false) {
  const { start, count } = visibleRange()
  const haveStart = state.windowStart
  const haveEnd = state.windowStart + state.windowRows.length

  const covered =
    !force &&
    state.windowVersion === state.rowVersion &&
    start >= haveStart &&
    start + count <= haveEnd

  if (covered) return

  const pending = state.pendingWindow
  if (
    !force &&
    pending &&
    pending.start === start &&
    pending.count === count
  ) {
    return
  }

  state.pendingWindow = { start, count }
  vscode.postMessage({ type: "requestWindow", payload: { start, count } })
}

export function renderSheetTabs(
  sheets: { name: string; index: number }[],
  activeIndex: number,
) {
  if (sheets.length <= 1) {
    dom.sheetTabs.innerHTML = ""
    dom.sheetTabs.classList.add("hidden")
    return
  }
  dom.sheetTabs.classList.remove("hidden")
  dom.sheetTabs.innerHTML = sheets
    .map(
      (sheet) =>
        `<button class="sheet-tab${sheet.index === activeIndex ? " active" : ""}" ` +
        `data-index="${sheet.index}" title="Double-click to rename">${escapeHtml(sheet.name)}</button>`,
    )
    .join("")
}

export function renderRowCount(total: number, unfiltered: number) {
  const filtered = total !== unfiltered
  dom.rowCount.textContent = filtered
    ? `${total.toLocaleString()} of ${unfiltered.toLocaleString()} rows`
    : `${total.toLocaleString()} rows`
  dom.rowCount.classList.toggle("filtered", filtered)
}
