import * as fs from "fs"
import * as path from "path"
import ExcelJS from "exceljs"
import Papa from "papaparse"
import {
  CellStyle,
  CellValue,
  argbToHex,
  getColumnLetter,
  isFormula,
} from "./model"

export { getColumnLetter }
export type { CellStyle, CellValue }

export interface SheetModel {
  /** Current (possibly renamed) sheet name. */
  name: string
  /** Name the sheet had on disk, used to find it again when saving. */
  originalName: string
  headers: string[]
  rows: CellValue[][]
  /** Key: "row,col" using *model* row indices (0 = first data row). */
  styles: Map<string, CellStyle>
}

/** CSV byte-level details we must reproduce so saving is not a rewrite. */
export interface CsvDialect {
  delimiter: string
  newline: string
  bom: boolean
  trailingNewline: boolean
  /** Model row indices that were genuinely empty lines, not rows of empties. */
  blankRows: Set<number>
}

export interface TableModel {
  headers: string[]
  rows: CellValue[][]
  styles: Map<string, CellStyle>
  sheetName: string
  sheetIndex: number
  sheets: SheetModel[]
  filePath: string
  /** mtime at load time; used to detect edits made outside the editor. */
  mtimeMs: number
  csvDialect?: CsvDialect
}

/** ExcelJS reads OOXML only — there is no BIFF (.xls) reader in the library. */
export class UnsupportedLegacyXlsError extends Error {
  constructor(filePath: string) {
    super(
      `Legacy .xls files are not supported (${path.basename(filePath)}). ` +
        `Open it in Excel or LibreOffice and re-save as .xlsx.`,
    )
    this.name = "UnsupportedLegacyXlsError"
  }
}

function statMtime(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs
  } catch {
    return 0
  }
}

/**
 * Normalise one ExcelJS cell into our CellValue union.
 *
 * Formulas keep both the expression and its cached result so a save can write
 * the formula back instead of freezing it into a literal.
 */
function readCellValue(cell: ExcelJS.Cell): CellValue {
  const value = cell.value

  if (value === null || value === undefined) return null

  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((rt) => rt.text).join("")
    }
    if ("formula" in value || "sharedFormula" in value) {
      const formulaValue = value as ExcelJS.CellFormulaValue &
        ExcelJS.CellSharedFormulaValue
      const formula = formulaValue.formula ?? formulaValue.sharedFormula ?? ""
      const result = formulaValue.result
      if (result !== null && result !== undefined && typeof result === "object") {
        // An error result such as { error: '#DIV/0!' }.
        if ("error" in result) {
          return { formula, result: String(result.error) }
        }
      }
      return { formula, result: result as CellValue as never }
    }
    if ("hyperlink" in value) {
      const link = value as ExcelJS.CellHyperlinkValue
      return { text: link.text ?? link.hyperlink, hyperlink: link.hyperlink }
    }
    if ("error" in value) {
      return String((value as ExcelJS.CellErrorValue).error)
    }
    if (value instanceof Date) return value
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  return String(value)
}

function readCellStyle(cell: ExcelJS.Cell): CellStyle | undefined {
  const style: CellStyle = {}

  if (cell.font?.bold) style.bold = true

  const fill = cell.fill
  if (fill && fill.type === "pattern" && fill.pattern !== "none") {
    const hex = argbToHex((fill as ExcelJS.FillPattern).fgColor?.argb)
    if (hex) style.bgColor = hex
  }

  const fontColor = argbToHex(cell.font?.color?.argb)
  if (fontColor) style.fontColor = fontColor

  return Object.keys(style).length > 0 ? style : undefined
}

/**
 * Parse an Excel workbook.
 *
 * Rows are read positionally from sheet row 2 through `rowCount`, *including*
 * blank rows. Model row index `i` therefore always maps to sheet row `i + 2`,
 * which keeps style keys aligned and lets the writer patch cells in place.
 */
export async function parseExcel(filePath: string): Promise<TableModel> {
  const mtimeMs = statMtime(filePath)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const sheets: SheetModel[] = []

  workbook.worksheets.forEach((worksheet) => {
    const colCount = Math.max(worksheet.columnCount || 0, 1)
    const rowCount = Math.max(worksheet.rowCount || 0, 1)

    const headers: string[] = []
    const headerRow = worksheet.getRow(1)
    for (let col = 1; col <= colCount; col++) {
      const raw = readCellValue(headerRow.getCell(col))
      const text =
        raw === null
          ? ""
          : isFormula(raw)
            ? String(raw.result ?? "")
            : String(raw)
      headers.push(text.trim() !== "" ? text : getColumnLetter(col - 1))
    }

    const rows: CellValue[][] = []
    const styles = new Map<string, CellStyle>()

    for (let rowNumber = 2; rowNumber <= rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber)
      const modelRow = rowNumber - 2
      const rowData: CellValue[] = []

      for (let col = 1; col <= colCount; col++) {
        const cell = row.getCell(col)
        rowData.push(readCellValue(cell))

        const style = readCellStyle(cell)
        if (style) styles.set(`${modelRow},${col - 1}`, style)
      }

      rows.push(rowData)
    }

    sheets.push({
      name: worksheet.name,
      originalName: worksheet.name,
      headers,
      rows,
      styles,
    })
  })

  if (sheets.length === 0) {
    throw new Error("No worksheets found in the Excel file")
  }

  const active = sheets[0]

  return {
    headers: active.headers,
    rows: active.rows,
    styles: active.styles,
    sheetName: active.name,
    sheetIndex: 0,
    sheets,
    filePath,
    mtimeMs,
  }
}

const DELIMITER_CANDIDATES = [",", ";", "\t", "|"]

/**
 * Guess the delimiter by counting candidates outside quoted sections.
 *
 * Papa's own auto-detection silently falls back to "," on short files (a
 * two-line semicolon CSV parses as a single column), so we decide it here and
 * pass the result to Papa explicitly.
 */
export function guessDelimiter(content: string, fallback = ","): string {
  const lines = content.split(/\r?\n/).filter((line) => line !== "").slice(0, 20)
  if (lines.length === 0) return fallback

  let best = fallback
  let bestCount = 0

  for (const candidate of DELIMITER_CANDIDATES) {
    const counts = lines.map((line) => {
      let inQuotes = false
      let count = 0
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') inQuotes = !inQuotes
        else if (char === candidate && !inQuotes) count++
      }
      return count
    })

    if (counts[0] === 0) continue
    // Every line must agree, otherwise this character is just data.
    const consistent = counts.every((count) => count === counts[0])
    if (consistent && counts[0] > bestCount) {
      best = candidate
      bestCount = counts[0]
    }
  }

  return best
}

/**
 * Sniff the byte-level shape of a CSV so we can write it back unchanged apart
 * from the cells that were actually edited.
 */
export function detectCsvDialect(content: string, delimiter: string): CsvDialect {
  const crlf = (content.match(/\r\n/g) || []).length
  const lf = (content.match(/(?<!\r)\n/g) || []).length
  return {
    delimiter: delimiter || ",",
    newline: crlf > lf ? "\r\n" : "\n",
    bom: content.charCodeAt(0) === 0xfeff,
    trailingNewline: /\r?\n$/.test(content),
    blankRows: new Set<number>(),
  }
}

/**
 * Parse a CSV file.
 *
 * Every value stays a string: CSV has no type information, and coercing here
 * would destroy identifiers like "007" or "00501" on the round trip.
 */
export async function parseCsv(filePath: string): Promise<TableModel> {
  const mtimeMs = statMtime(filePath)
  const raw = fs.readFileSync(filePath)
  let fileContent = raw.toString("utf-8")
  const hasBom = fileContent.charCodeAt(0) === 0xfeff
  if (hasBom) fileContent = fileContent.slice(1)

  const ext = path.extname(filePath).toLowerCase()
  const delimiter = guessDelimiter(fileContent, ext === ".tsv" ? "\t" : ",")

  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(fileContent, {
      header: false,
      delimiter,
      // Blank lines are content: dropping them silently deletes rows.
      skipEmptyLines: false,
      complete: (results) => {
        const data = results.data
        const dialect = detectCsvDialect(
          hasBom ? "﻿" + fileContent : fileContent,
          delimiter,
        )

        // Papa emits a trailing [""] row for a file ending in a newline; that
        // is the terminator, not a row.
        if (
          dialect.trailingNewline &&
          data.length > 0 &&
          data[data.length - 1].length === 1 &&
          data[data.length - 1][0] === ""
        ) {
          data.pop()
        }

        if (data.length === 0) {
          const styles = new Map<string, CellStyle>()
          resolve({
            headers: [],
            rows: [],
            styles,
            sheetName: "Sheet1",
            sheetIndex: 0,
            sheets: [
              {
                name: "Sheet1",
                originalName: "Sheet1",
                headers: [],
                rows: [],
                styles,
              },
            ],
            filePath,
            mtimeMs,
            csvDialect: dialect,
          })
          return
        }

        const colCount = data.reduce((max, row) => Math.max(max, row.length), 0)
        const headers = Array.from({ length: colCount }, (_, i) => {
          const value = data[0][i]
          return value && value.trim() !== "" ? value : getColumnLetter(i)
        })

        // Pad short rows so the grid is rectangular, but remember which ones
        // were genuinely empty lines so we can write them back as empty lines
        // rather than as a row of delimiters.
        const dataRows = data.slice(1)
        const rows: CellValue[][] = dataRows.map((row, index) => {
          if (row.length === 1 && row[0] === "") dialect.blankRows.add(index)
          return Array.from({ length: colCount }, (_, i) => row[i] ?? "")
        })

        const styles = new Map<string, CellStyle>()
        resolve({
          headers,
          rows,
          styles,
          sheetName: "Sheet1",
          sheetIndex: 0,
          sheets: [
            {
              name: "Sheet1",
              originalName: "Sheet1",
              headers,
              rows,
              styles,
            },
          ],
          filePath,
          mtimeMs,
          csvDialect: dialect,
        })
      },
      error: (error: Error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`))
      },
    })
  })
}

export async function parseFile(filePath: string): Promise<TableModel> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === ".xls") throw new UnsupportedLegacyXlsError(filePath)
  if (ext === ".xlsx" || ext === ".xlsm") return parseExcel(filePath)
  if (ext === ".csv" || ext === ".tsv") return parseCsv(filePath)

  throw new Error(
    `Unsupported file type: ${ext}. Supported types: .xlsx, .xlsm, .csv, .tsv`,
  )
}
