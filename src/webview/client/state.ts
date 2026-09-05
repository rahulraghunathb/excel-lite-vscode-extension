import type {
  CellStyle,
  InitPayload,
  Match,
  SelectionRange,
  VsCodeApi,
} from "./protocol"

export const DEFAULT_COL_WIDTH = 120
export const DEFAULT_ROW_HEIGHT = 28
export const MIN_COL_WIDTH = 50
export const MIN_ROW_HEIGHT = 22
/** Extra rows rendered above and below the viewport to smooth scrolling. */
export const OVERSCAN = 12

export const vscode: VsCodeApi = acquireVsCodeApi()

interface PersistedState {
  theme?: "dark" | "light" | "auto"
  columnWidths?: Record<number, number>
}

export const persisted: PersistedState =
  (vscode.getState() as PersistedState) || {}

export function persist() {
  vscode.setState(persisted)
}

export const state = {
  headers: [] as string[],
  totalRows: 0,
  rowVersion: -1,
  sheetIndex: 0,
  activeFilters: new Set<number>(),
  sort: null as InitPayload["sort"],
  canEditStructure: true,

  /** Find-and-replace hits in the current view, and the focused one. */
  matches: [] as Match[],
  currentMatch: null as Match | null,

  /** Rows currently materialised in the DOM. */
  windowStart: 0,
  windowRows: [] as string[][],
  windowStyles: {} as Record<string, CellStyle>,
  windowOriginalIndices: [] as number[],
  windowVersion: -1,
  pendingWindow: null as { start: number; count: number } | null,

  /** Column widths by column index; row heights by *original* row index so a
   *  resized row keeps its height after sorting or filtering. */
  columnWidths: new Map<number, number>(),
  rowHeights: new Map<number, number>(),

  ranges: [] as SelectionRange[],
  anchor: null as { r: number; c: number } | null,
  cursor: null as { r: number; c: number } | null,
  isDragging: false,
  activeRangeIndex: -1,

  editing: null as { row: number; col: number } | null,
  resizing: null as
    | { type: "col" | "row"; index: number; start: number; size: number; handle: HTMLElement }
    | null,
}

// Restore persisted column widths.
if (persisted.columnWidths) {
  for (const [key, value] of Object.entries(persisted.columnWidths)) {
    state.columnWidths.set(Number(key), value)
  }
}

export function columnWidth(col: number): number {
  return state.columnWidths.get(col) ?? DEFAULT_COL_WIDTH
}

export function rowHeight(originalRow: number | undefined): number {
  if (originalRow === undefined) return DEFAULT_ROW_HEIGHT
  return state.rowHeights.get(originalRow) ?? DEFAULT_ROW_HEIGHT
}

export function saveColumnWidths() {
  persisted.columnWidths = Object.fromEntries(state.columnWidths)
  persist()
}
