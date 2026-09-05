import { state, vscode } from "./state"
import { dom, ensureWindow, refreshSelectionClasses, uniformRowHeight } from "./render"
import type { SelectionRange } from "./protocol"

function normalise(range: SelectionRange): SelectionRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    endRow: Math.max(range.startRow, range.endRow),
    startCol: Math.min(range.startCol, range.endCol),
    endCol: Math.max(range.startCol, range.endCol),
  }
}

/**
 * Push the selection to the host.
 *
 * An empty selection is reported too — otherwise the status bar keeps showing
 * totals for a selection that no longer exists.
 */
export function postSelection() {
  vscode.postMessage({
    type: "selection",
    payload: { ranges: state.ranges.map(normalise) },
  })
}

export function clearSelection() {
  state.ranges = []
  state.cursor = null
  state.anchor = null
  state.activeRangeIndex = -1
  refreshSelectionClasses()
  postSelection()
}

export function selectCell(
  row: number,
  col: number,
  shiftKey = false,
  ctrlKey = false,
) {
  const point = { r: row, c: col }

  if (shiftKey && state.anchor) {
    state.ranges = [
      normalise({
        startRow: state.anchor.r,
        startCol: state.anchor.c,
        endRow: row,
        endCol: col,
      }),
    ]
    state.activeRangeIndex = 0
    state.cursor = point
  } else if (ctrlKey) {
    const existing = state.ranges.findIndex(
      (range) =>
        range.startRow === row &&
        range.endRow === row &&
        range.startCol === col &&
        range.endCol === col,
    )
    if (existing >= 0) state.ranges.splice(existing, 1)
    else {
      state.ranges.push({
        startRow: row,
        startCol: col,
        endRow: row,
        endCol: col,
      })
    }
    state.activeRangeIndex = state.ranges.length - 1
    state.anchor = point
    state.cursor = point
  } else {
    state.ranges = [{ startRow: row, startCol: col, endRow: row, endCol: col }]
    state.anchor = point
    state.cursor = point
    state.activeRangeIndex = 0
  }

  refreshSelectionClasses()
  postSelection()
}

export function extendSelection(row: number, col: number) {
  if (!state.anchor) return
  const updated = normalise({
    startRow: state.anchor.r,
    startCol: state.anchor.c,
    endRow: row,
    endCol: col,
  })
  if (state.activeRangeIndex >= 0 && state.ranges[state.activeRangeIndex]) {
    state.ranges[state.activeRangeIndex] = updated
  } else {
    state.ranges = [updated]
  }
  state.cursor = { r: row, c: col }
  refreshSelectionClasses()
}

export function selectRow(row: number) {
  state.ranges = [
    { startRow: row, startCol: 0, endRow: row, endCol: state.headers.length - 1 },
  ]
  state.anchor = { r: row, c: 0 }
  state.cursor = { r: row, c: 0 }
  state.activeRangeIndex = 0
  refreshSelectionClasses()
  postSelection()
}

export function selectColumn(col: number) {
  state.ranges = [
    { startRow: 0, startCol: col, endRow: state.totalRows - 1, endCol: col },
  ]
  state.anchor = { r: 0, c: col }
  state.cursor = { r: 0, c: col }
  state.activeRangeIndex = 0
  refreshSelectionClasses()
  postSelection()
}

export function selectAll() {
  state.ranges = [
    {
      startRow: 0,
      startCol: 0,
      endRow: Math.max(0, state.totalRows - 1),
      endCol: Math.max(0, state.headers.length - 1),
    },
  ]
  state.anchor = { r: 0, c: 0 }
  state.cursor = { r: 0, c: 0 }
  state.activeRangeIndex = 0
  refreshSelectionClasses()
  postSelection()
}

/** Scroll a view row into view, requesting its window if needed. */
export function scrollRowIntoView(row: number) {
  const top = row * uniformRowHeight
  const headerOffset = dom.grid.querySelector("thead")?.clientHeight ?? 0
  const viewTop = dom.grid.scrollTop
  const viewBottom = viewTop + dom.grid.clientHeight - headerOffset

  if (top < viewTop) dom.grid.scrollTop = top
  else if (top + uniformRowHeight > viewBottom) {
    dom.grid.scrollTop = top + uniformRowHeight - dom.grid.clientHeight + headerOffset
  }
  ensureWindow()
}

/** Move the cursor by a delta, optionally extending the selection. */
export function moveCursor(deltaRow: number, deltaCol: number, extend = false) {
  const current = state.cursor ?? { r: 0, c: 0 }
  const row = Math.max(0, Math.min(state.totalRows - 1, current.r + deltaRow))
  const col = Math.max(0, Math.min(state.headers.length - 1, current.c + deltaCol))

  if (extend) extendSelection(row, col)
  else selectCell(row, col)

  scrollRowIntoView(row)
}
