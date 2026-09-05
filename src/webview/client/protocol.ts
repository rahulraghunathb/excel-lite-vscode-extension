import type { CellStyle } from "../../model"
import type { ColumnFilter, SortState } from "../../grid"

export type { CellStyle, ColumnFilter, SortState }

export interface InitPayload {
  headers: string[]
  totalRows: number
  unfilteredRows: number
  rowVersion: number
  sheets: { name: string; index: number }[]
  sheetIndex: number
  sheetName: string
  fileName: string
  isAutoSaveEnabled: boolean
  sort: SortState | null
  activeFilters: number[]
  /** False while a sort or filter is active: row indices would be ambiguous. */
  canEditStructure: boolean
}

export interface Match {
  row: number
  col: number
}

export interface FindResultsPayload {
  query: string
  matches: Match[]
  truncated: boolean
}

export interface ActiveCellPayload {
  row: number
  col: number
  ref: string
  text: string
  style: CellStyle | null
}

export interface WindowPayload {
  start: number
  rows: string[][]
  styles: Record<string, CellStyle>
  originalIndices: number[]
  rowVersion: number
}

export interface AggregatesPayload {
  sum: string
  avg: string
  min: string
  max: string
  count: number
  numericCount: number
}

export interface FilterOptionsPayload {
  column: number
  values: string[]
  colors: string[]
  current: ColumnFilter | null
}

export interface EditValuePayload {
  row: number
  col: number
  text: string
}

export interface SelectionRange {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

export interface VsCodeApi {
  postMessage(message: { type: string; payload?: unknown }): void
  getState(): unknown
  setState(state: unknown): void
}

declare global {
  function acquireVsCodeApi(): VsCodeApi
}
