/**
 * Row and column insertion/removal.
 *
 * Structural edits are the awkward case for patch-based saving: inserting a row
 * shifts every row below it, so cell coordinates recorded earlier stop pointing
 * at the same cell. The approach here is:
 *
 *   1. apply the operation to the in-memory sheet;
 *   2. shift every recorded style key and dirty-cell key by the same amount, so
 *      all outstanding coordinates stay in *current* model space;
 *   3. record the operation in an ordered log, replayed onto the real worksheet
 *      at save time before any cell patch is applied.
 *
 * Kept free of `vscode` so the index arithmetic can be unit tested directly.
 */

import { CellStyle, CellValue, getColumnLetter } from "./model"

export type StructuralKind =
  | "insertRows"
  | "deleteRows"
  | "insertCols"
  | "deleteCols"

export interface StructuralOp {
  sheetIndex: number
  kind: StructuralKind
  /** Zero-based model index: row 0 is the first data row, column 0 the first. */
  at: number
  count: number
  /** Content removed by a delete, kept so undo can put it back. */
  removedRows?: CellValue[][]
  removedHeaders?: string[]
  /** Removed styles, keyed "rowOffset,colOffset" within the removed block. */
  removedStyles?: [string, CellStyle][]
}

export interface StructuralTarget {
  headers: string[]
  rows: CellValue[][]
  styles: Map<string, CellStyle>
}

function parseStyleKey(key: string): { row: number; col: number } {
  const comma = key.indexOf(",")
  return {
    row: Number(key.slice(0, comma)),
    col: Number(key.slice(comma + 1)),
  }
}

/**
 * Rebuild a style map with row/column indices shifted.
 *
 * `axis` selects which index moves; entries inside a removed band are dropped.
 */
function shiftStyles(
  styles: Map<string, CellStyle>,
  axis: "row" | "col",
  at: number,
  delta: number,
): Map<string, CellStyle> {
  const next = new Map<string, CellStyle>()
  styles.forEach((style, key) => {
    const { row, col } = parseStyleKey(key)
    const index = axis === "row" ? row : col

    if (index < at) {
      next.set(key, style)
      return
    }
    // Deleting: entries within [at, at - delta) disappear with the band.
    if (delta < 0 && index < at - delta) return

    const moved = index + delta
    next.set(axis === "row" ? `${moved},${col}` : `${row},${moved}`, style)
  })
  return next
}

/** The same shift, for the `sheetIndex:row,col` keys used by dirty tracking. */
export function shiftDirtyKeys(
  keys: Set<string>,
  sheetIndex: number,
  axis: "row" | "col",
  at: number,
  delta: number,
): Set<string> {
  const next = new Set<string>()
  keys.forEach((key) => {
    const colon = key.indexOf(":")
    const keySheet = Number(key.slice(0, colon))
    if (keySheet !== sheetIndex) {
      next.add(key)
      return
    }

    const { row, col } = parseStyleKey(key.slice(colon + 1))
    const index = axis === "row" ? row : col

    if (index < at) {
      next.add(key)
      return
    }
    if (delta < 0 && index < at - delta) return

    const moved = index + delta
    next.add(
      axis === "row"
        ? `${sheetIndex}:${moved},${col}`
        : `${sheetIndex}:${row},${moved}`,
    )
  })
  return next
}

function blankRow(width: number): CellValue[] {
  return new Array(width).fill(null)
}

/**
 * Apply a structural operation in place.
 *
 * Deletes record what they removed onto the returned op, so the caller can
 * store it for undo.
 */
export function applyStructural(
  target: StructuralTarget,
  op: StructuralOp,
): StructuralOp {
  const width = target.headers.length
  const result: StructuralOp = { ...op }

  switch (op.kind) {
    case "insertRows": {
      const inserted = Array.from({ length: op.count }, () => blankRow(width))
      target.rows.splice(op.at, 0, ...inserted)
      target.styles = shiftStyles(target.styles, "row", op.at, op.count)
      break
    }

    case "deleteRows": {
      const removedRows = target.rows.slice(op.at, op.at + op.count)
      const removedStyles: [string, CellStyle][] = []
      target.styles.forEach((style, key) => {
        const { row, col } = parseStyleKey(key)
        if (row >= op.at && row < op.at + op.count) {
          removedStyles.push([`${row - op.at},${col}`, style])
        }
      })

      target.rows.splice(op.at, op.count)
      target.styles = shiftStyles(target.styles, "row", op.at, -op.count)
      result.removedRows = removedRows
      result.removedStyles = removedStyles
      break
    }

    case "insertCols": {
      const headers = Array.from({ length: op.count }, () => "")
      target.headers.splice(op.at, 0, ...headers)
      // Re-letter placeholder headers so the new columns are labelled.
      relabelPlaceholders(target.headers)
      target.rows.forEach((row) =>
        row.splice(op.at, 0, ...new Array(op.count).fill(null)),
      )
      target.styles = shiftStyles(target.styles, "col", op.at, op.count)
      break
    }

    case "deleteCols": {
      const removedHeaders = target.headers.slice(op.at, op.at + op.count)
      const removedRows = target.rows.map((row) =>
        row.slice(op.at, op.at + op.count),
      )
      const removedStyles: [string, CellStyle][] = []
      target.styles.forEach((style, key) => {
        const { row, col } = parseStyleKey(key)
        if (col >= op.at && col < op.at + op.count) {
          removedStyles.push([`${row},${col - op.at}`, style])
        }
      })

      target.headers.splice(op.at, op.count)
      target.rows.forEach((row) => row.splice(op.at, op.count))
      target.styles = shiftStyles(target.styles, "col", op.at, -op.count)
      result.removedHeaders = removedHeaders
      result.removedRows = removedRows
      result.removedStyles = removedStyles
      break
    }
  }

  return result
}

/**
 * Columns with no real header show their spreadsheet letter. After an insert
 * those placeholders are stale, so any header that still looks like a bare
 * column letter is re-derived from its new position.
 */
function relabelPlaceholders(headers: string[]) {
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] === "" || /^[A-Z]{1,3}$/.test(headers[i])) {
      headers[i] = getColumnLetter(i)
    }
  }
}

/** The operation that reverses `op`, including restoring removed content. */
export function invertStructural(op: StructuralOp): StructuralOp {
  switch (op.kind) {
    case "insertRows":
      return { ...op, kind: "deleteRows" }
    case "deleteRows":
      return { ...op, kind: "insertRows" }
    case "insertCols":
      return { ...op, kind: "deleteCols" }
    case "deleteCols":
      return { ...op, kind: "insertCols" }
  }
}

/**
 * Put back what a delete removed, after its inverse insert has made room.
 *
 * Returns the coordinates written, so the caller can mark them dirty: the
 * re-inserted band is blank in the file until these are patched back in.
 */
export function restoreRemoved(
  target: StructuralTarget,
  op: StructuralOp,
): { cells: { row: number; col: number }[]; styles: { row: number; col: number }[] } {
  const cells: { row: number; col: number }[] = []
  const styles: { row: number; col: number }[] = []

  // Branch on the axis, not the direction: undo hands us the *inverted* op, so
  // a row deletion arrives here as "insertRows" carrying the removed content.
  const isRowAxis = op.kind === "insertRows" || op.kind === "deleteRows"

  if (isRowAxis && op.removedRows) {
    op.removedRows.forEach((rowData, offset) => {
      const row = op.at + offset
      if (!target.rows[row]) return
      rowData.forEach((value, col) => {
        target.rows[row][col] = value
        cells.push({ row, col })
      })
    })
  }

  if (!isRowAxis) {
    if (op.removedHeaders) {
      op.removedHeaders.forEach((header, offset) => {
        target.headers[op.at + offset] = header
      })
    }
    if (op.removedRows) {
      op.removedRows.forEach((rowSlice, row) => {
        if (!target.rows[row]) return
        rowSlice.forEach((value, offset) => {
          const col = op.at + offset
          target.rows[row][col] = value
          cells.push({ row, col })
        })
      })
    }
  }

  if (op.removedStyles) {
    for (const [key, style] of op.removedStyles) {
      const { row, col } = parseStyleKey(key)
      const targetRow = isRowAxis ? op.at + row : row
      const targetCol = isRowAxis ? col : op.at + col
      target.styles.set(`${targetRow},${targetCol}`, { ...style })
      styles.push({ row: targetRow, col: targetCol })
    }
  }

  return { cells, styles }
}
