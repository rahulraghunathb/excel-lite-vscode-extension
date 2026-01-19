import * as path from "path"
import * as fs from "fs"
import { parseFile } from "./fileParser"
import { writeCsv, writeExcel } from "./fileWriter"

async function runTests() {
  console.log("--- Starting Core Logic Tests ---")

  const inputCsv = path.join(__dirname, "..", "test-data.csv")
  const outputCsv = path.join(__dirname, "..", "test-output.csv")
  const outputExcel = path.join(__dirname, "..", "test-output.xlsx")

  try {
    // 1. Test CSV Parsing
    console.log(`[1] Testing CSV Parsing for: ${inputCsv}`)
    const tableModel = await parseFile(inputCsv)
    console.log(`Parsed Headers: ${tableModel.headers.join(", ")}`)
    console.log(`Parsed Rows: ${tableModel.rows.length}`)

    if (tableModel.rows.length === 0) {
      throw new Error("No rows parsed from CSV!")
    }

    // 2. Test CSV Writing
    console.log(`[2] Testing CSV Writing to: ${outputCsv}`)
    await writeCsv(outputCsv, tableModel)
    if (!fs.existsSync(outputCsv)) {
      throw new Error("Failed to write CSV output file!")
    }

    // 3. Test Excel Writing
    console.log(`[3] Testing Excel Writing to: ${outputExcel}`)
    await writeExcel(outputExcel, tableModel, tableModel.styles)
    if (!fs.existsSync(outputExcel)) {
      throw new Error("Failed to write Excel output file!")
    }

    // 4. Test Excel Parsing (the one we just wrote)
    console.log(`[4] Testing Excel Parsing for: ${outputExcel}`)
    const excelModel = await parseFile(outputExcel)
    console.log(`Parsed Excel Headers: ${excelModel.headers.join(", ")}`)
    console.log(`Parsed Excel Rows: ${excelModel.rows.length}`)

    if (excelModel.rows.length !== tableModel.rows.length) {
      throw new Error(
        `Row count mismatch! Original: ${tableModel.rows.length}, Excel: ${excelModel.rows.length}`
      )
    }

    console.log("\n--- All Core Logic Tests Passed Successfully! ---")
  } catch (error) {
    console.error("\n--- Test Failed! ---")
    console.error(error)
    process.exit(1)
  }
}

runTests()
