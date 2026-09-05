/**
 * Pure view logic: filtering, sorting and aggregates.
 *
 * Kept free of any `vscode` import so it can be unit tested directly, and so
 * the extension host and the tests agree on exactly one implementation.
 */

import {
  CellStyle,
  CellValue,
  compareValues,
  formatCellDisplay,
  isBlank,
  isDate,
  isFormula,
  toNumber,
} from "./model"

export type SortDirection = "asc" | "desc" | "none"

export interface ValuesFilter {
  kind: "values"
  /** Display strings that stay visible. */
  values: string[]
}

export interface ConditionFilter {
  kind: "condition"
  operator:
    | "contains"
    | "notContains"
    | "equals"
    | "notEquals"
    | "startsWith"
    | "endsWith"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "between"
    | "isEmpty"
    | "isNotEmpty"
  value?: string
  value2?: string
}

export interface ColorFilter {
  kind: "color"
  /** Hex fill colours to keep; the empty string means "no fill". */
  colors: string[]
}

export type ColumnFilter = ValuesFilter | ConditionFilter | ColorFilter

export interface SortState {
  column: number
  direction: SortDirection
  byColor?: boolean
}

export interface SelectionRange {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

/** Resolves a fill colour for a cell, by *original* row index. */
export type StyleLookup = (row: number, col: number) => CellStyle | undefined

export interface ProcessedRows {
  rows: CellValue[][]
  /** View index -> index into the underlying sheet rows. */
  originalIndices: number[]
}

function matchesCondition(value: CellValue, filter: ConditionFilter): boolean {
  const text = formatCellDisplay(value)
  const lower = text.toLowerCase()
  const target = (filter.value ?? "").toLowerCase()

  switch (filter.operator) {
    case "isEmpty":
      return text.trim() === ""
    case "isNotEmpty":
      return text.trim() !== ""
    case "contains":
      return lower.includes(target)
    case "notContains":
      return !lower.includes(target)
    case "equals":
      return lower === target
    case "notEquals":
      return lower !== target
    case "startsWith":
      return lower.startsWith(target)
    case "endsWith":
      return lower.endsWith(target)
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "between": {
      const cellNum = toNumber(value)
      const a = Number(filter.value)
      if (cellNum === null || !Number.isFinite(a)) return false
      if (filter.operator === "gt") return cellNum > a
      if (filter.operator === "gte") return cellNum >= a
      if (filter.operator === "lt") return cellNum < a
      if (filter.operator === "lte") return cellNum <= a
      const b = Number(filter.value2)
      if (!Number.isFinite(b)) return false
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      return cellNum >= lo && cellNum <= hi
    }
    default:
      return true
  }
}

function matchesFilter(
  value: CellValue,
  filter: ColumnFilter,
  fill: string,
): boolean {
  switch (filter.kind) {
    case "values":
      // Compared as display strings, so a Date matches the same text the user
      // ticked in the popup and a numeric 0 matches "0" rather than "".
      return filter.values.includes(formatCellDisplay(value))
    case "color":
      return filter.colors.includes(fill)
    case "condition":
      return matchesCondition(value, filter)
    default:
      return true
  }
}

/**
 * Apply every active column filter, then the sort, returning the visible rows
 * alongside a map back to their original indices.
 */
export function getProcessedRows(
  allRows: CellValue[][],
  filters: Map<number, ColumnFilter>,
  sort: SortState | null,
  getStyle: StyleLookup = () => undefined,
): ProcessedRows {
  let indices = allRows.map((_, index) => index)

  filters.forEach((filter, col) => {
    indices = indices.filter((rowIndex) => {
      const value = allRows[rowIndex]?.[col] ?? null
      const fill = getStyle(rowIndex, col)?.bgColor ?? ""
      return matchesFilter(value, filter, fill)
    })
  })

  if (sort && sort.column >= 0 && sort.direction !== "none") {
    const factor = sort.direction === "asc" ? 1 : -1
    // Decorate with position so equal keys keep their original order; a plain
    // Array#sort comparator returning 0 is not guaranteed stable across engines
    // for large arrays.
    const decorated = indices.map((rowIndex, position) => ({ rowIndex, position }))

    decorated.sort((a, b) => {
      // Blanks are pinned to the bottom in *both* directions, so this test has
      // to happen outside the ascending/descending multiplier below.
      if (!sort.byColor) {
        const aBlank = isBlank(allRows[a.rowIndex]?.[sort.column] ?? null)
        const bBlank = isBlank(allRows[b.rowIndex]?.[sort.column] ?? null)
        if (aBlank && bBlank) return a.position - b.position
        if (aBlank) return 1
        if (bBlank) return -1
      }

      let result: number
      if (sort.byColor) {
        const aFill = getStyle(a.rowIndex, sort.column)?.bgColor ?? ""
        const bFill = getStyle(b.rowIndex, sort.column)?.bgColor ?? ""
        // Filled cells first, then grouped by colour.
        if (aFill === bFill) result = 0
        else if (aFill === "") result = 1
        else if (bFill === "") result = -1
        else result = aFill.localeCompare(bFill)
      } else {
        result = compareValues(
          allRows[a.rowIndex]?.[sort.column] ?? null,
          allRows[b.rowIndex]?.[sort.column] ?? null,
        )
      }
      if (result !== 0) return result * factor
      return a.position - b.position
    })

    indices = decorated.map((entry) => entry.rowIndex)
  }

  return {
    rows: indices.map((index) => allRows[index]),
    originalIndices: indices,
  }
}

/**
 * Distinct display values for a column, computed from *all* rows.
 *
 * Building this from the visible rows means a value you filter out can never
 * be selected again, which strands the user with no way back.
 */
export function getColumnValues(
  allRows: CellValue[][],
  col: number,
): string[] {
  const seen = new Set<string>()
  for (const row of allRows) {
    seen.add(formatCellDisplay(row?.[col] ?? null))
  }
  return Array.from(seen).sort((a, b) => {
    if (a === "") return 1
    if (b === "") return -1
    return compareValues(a, b)
  })
}

/** Distinct fill colours in a column, for the "filter by colour" list. */
export function getColumnColors(
  rowCount: number,
  col: number,
  getStyle: StyleLookup,
): string[] {
  const seen = new Set<string>()
  for (let row = 0; row < rowCount; row++) {
    seen.add(getStyle(row, col)?.bgColor ?? "")
  }
  return Array.from(seen).sort()
}

export interface Aggregates {
  sum: string
  avg: string
  min: string
  max: string
  count: number
  numericCount: number
}

function trimNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Math.round(value * 1e10) / 1e10)
}

/**
 * SUM / AVG / MIN / MAX / COUNT over the selection.
 *
 * Returns null for an empty selection so the caller can clear the status bar
 * rather than leaving the previous numbers on screen.
 */
export function computeAggregates(
  rows: CellValue[][],
  ranges: SelectionRange[],
): Aggregates | null {
  if (ranges.length === 0) return null

  const numbers: number[] = []
  let count = 0
  // A cell covered by two overlapping ranges must only be counted once.
  const counted = new Set<string>()

  for (const range of ranges) {
    const startRow = Math.max(0, Math.min(range.startRow, range.endRow))
    const endRow = Math.min(rows.length - 1, Math.max(range.startRow, range.endRow))
    const startCol = Math.min(range.startCol, range.endCol)
    const endCol = Math.max(range.startCol, range.endCol)

    for (let row = startRow; row <= endRow; row++) {
      const rowData = rows[row]
      if (!rowData) continue
      for (let col = startCol; col <= endCol; col++) {
        if (col < 0 || col >= rowData.length) continue
        const key = `${row},${col}`
        if (counted.has(key)) continue
        counted.add(key)

        const value = rowData[col]
        if (isBlank(value)) continue
        count++
        // Dates convert to epoch milliseconds, which would make SUM and AVG
        // over a date column meaningless. Only true numerics contribute.
        const resolved = isFormula(value) ? ((value.result ?? null) as CellValue) : value
        if (isDate(resolved)) continue
        const num = toNumber(resolved)
        if (num !== null) numbers.push(num)
      }
    }
  }

  if (count === 0) return null

  const sum = numbers.reduce((a, b) => a + b, 0)
  return {
    sum: numbers.length ? trimNumber(sum) : "",
    avg: numbers.length ? trimNumber(sum / numbers.length) : "",
    min: numbers.length ? trimNumber(Math.min(...numbers)) : "",
    max: numbers.length ? trimNumber(Math.max(...numbers)) : "",
    count,
    numericCount: numbers.length,
  }
}

/** Next direction in the asc -> desc -> none cycle for a header click. */
export function cycleSort(current: SortState | null, column: number): SortState {
  if (!current || current.column !== column || current.byColor) {
    return { column, direction: "asc" }
  }
  if (current.direction === "asc") return { column, direction: "desc" }
  if (current.direction === "desc") return { column, direction: "none" }
  return { column, direction: "asc" }
}
