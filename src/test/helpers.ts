import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import ExcelJS from "exceljs"

/** Per-run temp directory, cleaned up by the caller. */
export function makeTempDir(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `excel-lite-${label}-`))
  return dir
}

export function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

/**
 * A workbook exercising everything the old writer destroyed: extra sheets,
 * formulas, dates, a blank row, styling after the blank row, merges, column
 * widths, number formats and a frozen header.
 */
export async function createRichWorkbook(filePath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook()

  const data = workbook.addWorksheet("Data")
  data.addRow(["Name", "Qty", "Price", "Total", "Date"])
  data.addRow(["Widget", 10, 2.5, { formula: "B2*C2", result: 25 }, new Date(Date.UTC(2026, 0, 15))])
  data.addRow(["Gadget", 0, 3.0, { formula: "B3*C3", result: 0 }, new Date(Date.UTC(2026, 1, 1))])
  data.addRow([])
  data.addRow(["Doohickey", 7, 1.25, { formula: "B5*C5", result: 8.75 }, new Date(Date.UTC(2026, 2, 9))])

  data.getCell("A5").font = { bold: true }
  data.getCell("A5").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFF00" },
  }
  data.getColumn(1).width = 32
  data.getColumn(3).numFmt = '"$"#,##0.00'
  data.views = [{ state: "frozen", ySplit: 1 }]
  data.mergeCells("G1:H1")

  const summary = workbook.addWorksheet("Summary")
  summary.addRow(["Metric", "Value"])
  summary.addRow(["Revenue", 33.75])

  const notes = workbook.addWorksheet("Notes")
  notes.addRow(["Note"])
  notes.addRow(["keep me"])

  await workbook.xlsx.writeFile(filePath)
}

export async function readWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  return workbook
}

export function writeText(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, "utf-8")
}

export function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8")
}
