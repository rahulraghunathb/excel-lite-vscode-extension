import * as fs from "fs"
import * as path from "path"
import ExcelJS from "exceljs"
import { TableModel, CsvDialect } from "./fileParser"
import {
  CellStyle,
  CellValue,
  formatCellDisplay,
  hexToArgb,
  isDate,
  isFormula,
  isHyperlink,
} from "./model"

/**
 * What changed since the file was loaded.
 *
 * Keys are `sheetIndex:row,col` using model coordinates. Saving applies only
 * these, so every sheet, formula, merge, chart, column width and number format
 * we never touched survives untouched.
 */
export interface DirtyState {
  cells: Set<string>
  styles: Set<string>
  sheetNames: boolean
}

export function emptyDirtyState(): DirtyState {
  return { cells: new Set(), styles: new Set(), sheetNames: false }
}

export function dirtyKey(sheetIndex: number, row: number, col: number): string {
  return `${sheetIndex}:${row},${col}`
}

function parseDirtyKey(key: string): {
  sheetIndex: number
  row: number
  col: number
} {
  const [sheetPart, cellPart] = key.split(":")
  const [row, col] = cellPart.split(",")
  return {
    sheetIndex: Number(sheetPart),
    row: Number(row),
    col: Number(col),
  }
}

/** Convert our CellValue union back into something ExcelJS understands. */
function toExcelValue(value: CellValue): ExcelJS.CellValue {
  if (value === null || value === undefined) return null
  if (isFormula(value)) {
    return {
      formula: value.formula,
      result: value.result as never,
    } as ExcelJS.CellFormulaValue
  }
  if (isHyperlink(value)) {
    return {
      text: value.text,
      hyperlink: value.hyperlink,
    } as ExcelJS.CellHyperlinkValue
  }
  if (isDate(value)) return value
  return value as ExcelJS.CellValue
}

/**
 * Apply our three tracked style properties without disturbing the rest of the
 * cell's formatting (size, family, italics, borders, number format...).
 */
function applyCellStyle(cell: ExcelJS.Cell, style: CellStyle | undefined) {
  const font: Partial<ExcelJS.Font> = { ...(cell.font || {}) }
  font.bold = !!style?.bold

  const fontArgb = style?.fontColor ? hexToArgb(style.fontColor) : undefined
  if (fontArgb) font.color = { argb: fontArgb }
  else delete font.color

  cell.font = font as ExcelJS.Font

  const fillArgb = style?.bgColor ? hexToArgb(style.bgColor) : undefined
  if (fillArgb) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fillArgb },
    }
  } else if (cell.fill && cell.fill.type === "pattern") {
    cell.fill = { type: "pattern", pattern: "none" }
  }
}

/** Locate a worksheet by the name it had on disk, falling back to position. */
function findWorksheet(
  workbook: ExcelJS.Workbook,
  model: TableModel,
  sheetIndex: number,
): ExcelJS.Worksheet | undefined {
  const sheet = model.sheets[sheetIndex]
  if (!sheet) return undefined
  return (
    workbook.getWorksheet(sheet.originalName) ??
    workbook.worksheets[sheetIndex] ??
    undefined
  )
}

/** Build a workbook from scratch (Save As from CSV, or a missing source). */
function buildWorkbookFromModel(model: TableModel): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()

  model.sheets.forEach((sheet) => {
    const worksheet = workbook.addWorksheet(sheet.name || "Sheet1")
    const headerRow = worksheet.addRow(sheet.headers)
    headerRow.font = { bold: true }

    sheet.rows.forEach((rowData, rowIndex) => {
      const row = worksheet.addRow(rowData.map(toExcelValue))
      rowData.forEach((_, colIndex) => {
        const style = sheet.styles.get(`${rowIndex},${colIndex}`)
        if (style) applyCellStyle(row.getCell(colIndex + 1), style)
      })
    })

    worksheet.columns.forEach((column, index) => {
      let maxLength = String(sheet.headers[index] ?? "").length
      sheet.rows.forEach((row) => {
        const length = formatCellDisplay(row[index] ?? null).length
        if (length > maxLength) maxLength = length
      })
      column.width = Math.min(Math.max(maxLength + 2, 10), 50)
    })
  })

  if (workbook.worksheets.length === 0) workbook.addWorksheet("Sheet1")
  return workbook
}

/**
 * Save an Excel workbook by patching the original file rather than rebuilding
 * it. When no usable source exists the workbook is generated from the model.
 */
export async function writeExcel(
  targetPath: string,
  model: TableModel,
  dirty: DirtyState,
  sourcePath?: string,
): Promise<void> {
  const base = sourcePath ?? model.filePath
  const baseExt = path.extname(base).toLowerCase()
  const canPatch =
    (baseExt === ".xlsx" || baseExt === ".xlsm") && fs.existsSync(base)

  let workbook: ExcelJS.Workbook

  if (canPatch) {
    workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(base)

    for (const key of dirty.cells) {
      const { sheetIndex, row, col } = parseDirtyKey(key)
      const worksheet = findWorksheet(workbook, model, sheetIndex)
      if (!worksheet) continue
      const value = model.sheets[sheetIndex]?.rows[row]?.[col] ?? null
      // Model row 0 is sheet row 2 — row 1 holds the headers.
      worksheet.getRow(row + 2).getCell(col + 1).value = toExcelValue(value)
    }

    for (const key of dirty.styles) {
      const { sheetIndex, row, col } = parseDirtyKey(key)
      const worksheet = findWorksheet(workbook, model, sheetIndex)
      if (!worksheet) continue
      const style = model.sheets[sheetIndex]?.styles.get(`${row},${col}`)
      applyCellStyle(worksheet.getRow(row + 2).getCell(col + 1), style)
    }

    if (dirty.sheetNames) {
      model.sheets.forEach((sheet, index) => {
        const worksheet = findWorksheet(workbook, model, index)
        if (worksheet && worksheet.name !== sheet.name) {
          worksheet.name = sheet.name
        }
      })
    }
  } else {
    workbook = buildWorkbookFromModel(model)
  }

  await workbook.xlsx.writeFile(targetPath)
}

const DEFAULT_CSV_DIALECT: CsvDialect = {
  delimiter: ",",
  newline: "\n",
  bom: false,
  trailingNewline: true,
  blankRows: new Set<number>(),
}

function encodeCsvField(value: CellValue, delimiter: string): string {
  const text = formatCellDisplay(value)
  const needsQuotes =
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Write CSV back in the shape it arrived: same delimiter, same line endings,
 * same BOM, same trailing-newline convention. Otherwise every save shows up as
 * a whole-file diff in git.
 */
export async function writeCsv(
  targetPath: string,
  model: TableModel,
): Promise<void> {
  const dialect = model.csvDialect ?? DEFAULT_CSV_DIALECT

  const encodeRow = (row: CellValue[]) =>
    row.map((cell) => encodeCsvField(cell, dialect.delimiter)).join(
      dialect.delimiter,
    )

  const lines = [encodeRow(model.headers)]
  model.rows.forEach((row, index) => {
    // A line that arrived empty and is still empty goes back out empty,
    // instead of becoming a row of bare delimiters.
    const stillEmpty = row.every((cell) => formatCellDisplay(cell) === "")
    if (stillEmpty && dialect.blankRows.has(index)) {
      lines.push("")
      return
    }
    lines.push(encodeRow(row))
  })

  let content = lines.join(dialect.newline)

  if (dialect.trailingNewline) content += dialect.newline
  if (dialect.bom) content = "﻿" + content

  await fs.promises.writeFile(targetPath, content, "utf-8")
}

/** Save to whichever format the target path implies. */
export async function writeFile(
  targetPath: string,
  model: TableModel,
  dirty: DirtyState,
  sourcePath?: string,
): Promise<void> {
  const ext = path.extname(targetPath).toLowerCase()
  if (ext === ".xlsx" || ext === ".xlsm") {
    await writeExcel(targetPath, model, dirty, sourcePath)
    return
  }
  if (ext === ".csv" || ext === ".tsv") {
    await writeCsv(targetPath, model)
    return
  }
  throw new Error(`Unsupported save format: ${ext}`)
}
