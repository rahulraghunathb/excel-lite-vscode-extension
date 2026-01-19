import * as fs from "fs"
import ExcelJS from "exceljs"
import { TableModel, CellStyle } from "./fileParser"

/**
 * Write table data to an Excel file with styles
 */
export async function writeExcel(
  filePath: string,
  tableModel: TableModel,
  styles: Map<string, CellStyle>
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(tableModel.sheetName || "Sheet1")

  // Add headers
  const headerRow = worksheet.addRow(tableModel.headers)
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    }
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
  })

  // Add data rows with styles
  tableModel.rows.forEach((rowData, rowIndex) => {
    const row = worksheet.addRow(rowData)

    rowData.forEach((_, colIndex) => {
      const styleKey = `${rowIndex},${colIndex}`
      const style = styles.get(styleKey)

      if (style) {
        const cell = row.getCell(colIndex + 1)

        if (style.bold) {
          cell.font = { ...cell.font, bold: true }
        }

        if (style.bgColor) {
          // Convert hex color to ARGB format
          const argb = style.bgColor.replace("#", "FF")
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb },
          }
        }
      }
    })
  })

  // Auto-fit columns
  worksheet.columns.forEach((column) => {
    if (column && column.values) {
      let maxLength = 0
      column.values.forEach((v) => {
        const length = v ? String(v).length : 0
        if (length > maxLength) {
          maxLength = length
        }
      })
      column.width = Math.min(Math.max(maxLength + 2, 10), 50)
    }
  })

  // Save the file
  await workbook.xlsx.writeFile(filePath)
  console.log(`[Excel Lite] Saved Excel file: ${filePath}`)
}

/**
 * Write table data to a CSV file
 */
export async function writeCsv(
  filePath: string,
  tableModel: TableModel
): Promise<void> {
  const rows = [tableModel.headers, ...tableModel.rows]

  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? "")
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return str
        })
        .join(",")
    )
    .join("\n")

  fs.writeFileSync(filePath, csvContent, "utf-8")
  console.log(`[Excel Lite] Saved CSV file: ${filePath}`)
}
