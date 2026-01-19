import * as fs from "fs"
import * as path from "path"
import ExcelJS from "exceljs"
import Papa from "papaparse"

/**
 * Cell style information
 */
export interface CellStyle {
  bold?: boolean
  bgColor?: string
  fontColor?: string
}

export interface SheetModel {
  name: string
  headers: string[]
  rows: any[][]
  styles: Map<string, CellStyle>
}

/**
 * Unified table model for both Excel and CSV files
 */
export interface TableModel {
  headers: string[]
  rows: any[][]
  styles: Map<string, CellStyle> // Key: "row,col"
  sheetName: string
  sheetIndex: number
  sheets: SheetModel[]
  filePath: string
}

/**
 * Generate column letter from index (0 -> A, 1 -> B, ... 26 -> AA)
 */
export function getColumnLetter(index: number): string {
  let result = ""
  let n = index
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

/**
 * Parse an Excel file (.xlsx) and return a TableModel
 */
export async function parseExcel(filePath: string): Promise<TableModel> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const sheets: SheetModel[] = []

  workbook.worksheets.forEach((worksheet) => {
    const headers: string[] = []
    const rows: any[][] = []
    const styles = new Map<string, CellStyle>()

    let maxCol = 0

    // First pass: determine dimensions and get headers
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      if (row.cellCount > maxCol) {
        maxCol = row.cellCount
      }
    })

    // Get headers from first row
    const headerRow = worksheet.getRow(1)
    for (let col = 1; col <= maxCol; col++) {
      const cell = headerRow.getCell(col)
      const value = cell.value
      headers.push(
        value !== null && value !== undefined
          ? String(value)
          : getColumnLetter(col - 1),
      )
    }

    // Get data rows and styles
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return // Skip header row

      const rowData: any[] = []
      for (let col = 1; col <= maxCol; col++) {
        const cell = row.getCell(col)
        let value = cell.value

        // Handle rich text
        if (value && typeof value === "object" && "richText" in value) {
          value = (value as ExcelJS.CellRichTextValue).richText
            .map((rt) => rt.text)
            .join("")
        }

        // Handle formula results
        if (value && typeof value === "object" && "result" in value) {
          value = (value as ExcelJS.CellFormulaValue).result
        }

        rowData.push(value !== null && value !== undefined ? value : "")

        // Extract styles
        const cellStyle: CellStyle = {}
        const font = cell.font
        const fill = cell.fill

        if (font?.bold) {
          cellStyle.bold = true
        }

        if (fill && fill.type === "pattern" && fill.fgColor?.argb) {
          cellStyle.bgColor = "#" + fill.fgColor.argb.substring(2) // Remove alpha
        }

        if (Object.keys(cellStyle).length > 0) {
          styles.set(`${rowNumber - 2},${col - 1}`, cellStyle)
        }
      }
      rows.push(rowData)
    })

    sheets.push({ name: worksheet.name, headers, rows, styles })
  })

  if (sheets.length === 0) {
    throw new Error("No worksheets found in the Excel file")
  }

  const active = sheets[0]

  console.log(`[Excel Lite] Parsed Excel file: ${path.basename(filePath)}`)
  console.log(
    `[Excel Lite] Headers: ${active.headers.length}, Rows: ${active.rows.length}`,
  )

  return {
    headers: active.headers,
    rows: active.rows,
    styles: active.styles,
    sheetName: active.name,
    sheetIndex: 0,
    sheets,
    filePath,
  }
}

/**
 * Parse a CSV file and return a TableModel
 */
export async function parseCsv(filePath: string): Promise<TableModel> {
  const fileContent = fs.readFileSync(filePath, "utf-8")

  return new Promise((resolve, reject) => {
    Papa.parse(fileContent, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as string[][]

        if (data.length === 0) {
          const styles = new Map()
          resolve({
            headers: [],
            rows: [],
            styles,
            sheetName: "Sheet1",
            sheetIndex: 0,
            sheets: [{ name: "Sheet1", headers: [], rows: [], styles }],
            filePath,
          })
          return
        }

        const headers = data[0].map((h, i) => h || getColumnLetter(i))
        const rows = data.slice(1)

        console.log(`[Excel Lite] Parsed CSV file: ${path.basename(filePath)}`)
        console.log(
          `[Excel Lite] Headers: ${headers.length}, Rows: ${rows.length}`,
        )

        const styles = new Map()
        resolve({
          headers,
          rows,
          styles,
          sheetName: "Sheet1",
          sheetIndex: 0,
          sheets: [{ name: "Sheet1", headers, rows, styles }],
          filePath,
        })
      },
      error: (error: Error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`))
      },
    })
  })
}

/**
 * Parse a file based on its extension
 */
export async function parseFile(filePath: string): Promise<TableModel> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === ".xlsx" || ext === ".xls") {
    return parseExcel(filePath)
  } else if (ext === ".csv") {
    return parseCsv(filePath)
  } else {
    throw new Error(
      `Unsupported file type: ${ext}. Supported types: .xlsx, .xls, .csv`,
    )
  }
}
