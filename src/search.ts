/**
 * Find and replace over the visible grid.
 *
 * Matching runs against `formatCellEdit`, the same text the cell editor shows.
 * A formula therefore matches on `=B2*C2` rather than its cached result, so a
 * replacement round-trips back into a formula instead of freezing it to a value.
 */

import { CellValue, formatCellEdit } from "./model"

export interface SearchOptions {
  query: string
  matchCase?: boolean
  /** Require the whole cell to equal the query, not merely contain it. */
  wholeCell?: boolean
}

export interface Match {
  row: number
  col: number
}

/** Matches are capped so a pathological query cannot flood the webview. */
export const MATCH_LIMIT = 5000

function normalise(text: string, matchCase: boolean | undefined): string {
  return matchCase ? text : text.toLowerCase()
}

export function cellMatches(value: CellValue, options: SearchOptions): boolean {
  if (options.query === "") return false
  const text = normalise(formatCellEdit(value), options.matchCase)
  const query = normalise(options.query, options.matchCase)
  return options.wholeCell ? text === query : text.includes(query)
}

/** Every matching cell, in reading order, capped at MATCH_LIMIT. */
export function findMatches(
  rows: CellValue[][],
  options: SearchOptions,
): { matches: Match[]; truncated: boolean } {
  const matches: Match[] = []
  if (options.query === "") return { matches, truncated: false }

  for (let row = 0; row < rows.length; row++) {
    const rowData = rows[row]
    if (!rowData) continue
    for (let col = 0; col < rowData.length; col++) {
      if (cellMatches(rowData[col], options)) {
        if (matches.length >= MATCH_LIMIT) return { matches, truncated: true }
        matches.push({ row, col })
      }
    }
  }
  return { matches, truncated: false }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * The replacement text for one cell, or null when nothing matched.
 *
 * Returns text; the caller coerces it back into a typed cell value.
 */
export function replaceInCell(
  value: CellValue,
  options: SearchOptions,
  replacement: string,
): string | null {
  if (!cellMatches(value, options)) return null

  const text = formatCellEdit(value)
  if (options.wholeCell) return replacement

  const flags = options.matchCase ? "g" : "gi"
  return text.replace(new RegExp(escapeRegExp(options.query), flags), () => replacement)
}
