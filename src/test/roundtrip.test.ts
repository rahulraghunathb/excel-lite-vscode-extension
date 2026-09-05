import { test, describe, before, after } from "node:test"
import assert from "node:assert/strict"
import * as path from "path"
import * as fs from "fs"

import { parseFile, parseExcel, UnsupportedLegacyXlsError } from "../fileParser"
import {
  writeExcel,
  writeCsv,
  emptyDirtyState,
  dirtyKey,
  DirtyState,
} from "../fileWriter"
import { formatCellDisplay, isFormula, isDate } from "../model"
import {
  createRichWorkbook,
  makeTempDir,
  readText,
  readWorkbook,
  removeDir,
  writeText,
} from "./helpers"

let dir: string

before(() => {
  dir = makeTempDir("roundtrip")
})
after(() => {
  removeDir(dir)
})

describe("Excel round trip", () => {
  test("preserves every sheet when saving (was: all but the active sheet destroyed)", async () => {
    const src = path.join(dir, "sheets.xlsx")
    const out = path.join(dir, "sheets-out.xlsx")
    await createRichWorkbook(src)

    const model = await parseFile(src)
    assert.deepEqual(
      model.sheets.map((s) => s.name),
      ["Data", "Summary", "Notes"],
    )

    await writeExcel(out, model, emptyDirtyState(), src)

    const saved = await readWorkbook(out)
    assert.deepEqual(
      saved.worksheets.map((w) => w.name),
      ["Data", "Summary", "Notes"],
    )
    assert.equal(saved.getWorksheet("Notes")!.getCell("A2").value, "keep me")
    assert.equal(saved.getWorksheet("Summary")!.getCell("B2").value, 33.75)
  })

  test("preserves blank rows (was: silently deleted)", async () => {
    const src = path.join(dir, "blank.xlsx")
    const out = path.join(dir, "blank-out.xlsx")
    await createRichWorkbook(src)

    const model = await parseFile(src)
    // Widget, Gadget, <blank>, Doohickey
    assert.equal(model.rows.length, 4)
    assert.equal(formatCellDisplay(model.rows[2][0]), "")
    assert.equal(formatCellDisplay(model.rows[3][0]), "Doohickey")

    await writeExcel(out, model, emptyDirtyState(), src)
    const saved = await readWorkbook(out)
    assert.equal(saved.getWorksheet("Data")!.getCell("A5").value, "Doohickey")
  })

  test("keeps styles aligned to their row across a blank row", async () => {
    const src = path.join(dir, "styles.xlsx")
    await createRichWorkbook(src)
    const model = await parseFile(src)

    // Doohickey is model row 3 (sheet row 5) and carries the bold + yellow fill.
    const style = model.styles.get("3,0")
    assert.ok(style, "expected a style on the Doohickey row")
    assert.equal(style!.bold, true)
    assert.equal(style!.bgColor, "#ffff00")
    assert.equal(formatCellDisplay(model.rows[3][0]), "Doohickey")
  })

  test("preserves formatting on save (was: all cell formatting lost)", async () => {
    const src = path.join(dir, "keepfmt.xlsx")
    const out = path.join(dir, "keepfmt-out.xlsx")
    await createRichWorkbook(src)

    const model = await parseFile(src)
    await writeExcel(out, model, emptyDirtyState(), src)

    const saved = await readWorkbook(out)
    const cell = saved.getWorksheet("Data")!.getCell("A5")
    assert.equal(cell.font?.bold, true)
    assert.equal((cell.fill as any)?.fgColor?.argb, "FFFFFF00")
  })

  test("preserves formulas instead of freezing them to values", async () => {
    const src = path.join(dir, "formula.xlsx")
    const out = path.join(dir, "formula-out.xlsx")
    await createRichWorkbook(src)

    const model = await parseFile(src)
    const cell = model.rows[0][3]
    assert.ok(isFormula(cell), "formula cell should parse as a formula")
    assert.equal((cell as any).formula, "B2*C2")
    // Displays the cached result, never "[object Object]".
    assert.equal(formatCellDisplay(cell), "25")

    // ExcelJS omits falsy cached results when it writes a file, so this cell
    // comes back with no result at all. It must still render readably as the
    // formula text rather than "[object Object]".
    assert.equal(formatCellDisplay(model.rows[1][3]), "=B3*C3")

    await writeExcel(out, model, emptyDirtyState(), src)
    const saved = await readWorkbook(out)
    const savedCell = saved.getWorksheet("Data")!.getCell("D2").value as any
    assert.equal(savedCell.formula, "B2*C2")
  })

  test("preserves dates as dates, displayed as YYYY-MM-DD", async () => {
    const src = path.join(dir, "dates.xlsx")
    const out = path.join(dir, "dates-out.xlsx")
    await createRichWorkbook(src)

    const model = await parseFile(src)
    assert.ok(isDate(model.rows[0][4]))
    assert.equal(formatCellDisplay(model.rows[0][4]), "2026-01-15")

    await writeExcel(out, model, emptyDirtyState(), src)
    const saved = await readWorkbook(out)
    const value = saved.getWorksheet("Data")!.getCell("E2").value
    assert.ok(value instanceof Date, "date must stay a Date, not become text")
  })

  test("preserves header formatting (was: overwritten with blue every save)", async () => {
    const src = path.join(dir, "header.xlsx")
    const out = path.join(dir, "header-out.xlsx")
    await createRichWorkbook(src)

    const model = await parseFile(src)
    await writeExcel(out, model, emptyDirtyState(), src)

    const saved = await readWorkbook(out)
    const header = saved.getWorksheet("Data")!.getCell("A1")
    assert.notEqual((header.fill as any)?.fgColor?.argb, "FF4472C4")
    assert.equal(header.value, "Name")
  })

  test("preserves widths, number formats, merges and frozen panes", async () => {
    const src = path.join(dir, "extras.xlsx")
    const out = path.join(dir, "extras-out.xlsx")
    await createRichWorkbook(src)

    const model = await parseFile(src)
    await writeExcel(out, model, emptyDirtyState(), src)

    const sheet = (await readWorkbook(out)).getWorksheet("Data")!
    assert.equal(sheet.getColumn(1).width, 32)
    assert.equal(sheet.getColumn(3).numFmt, '"$"#,##0.00')
    assert.equal(sheet.views[0]?.state, "frozen")
    assert.ok(sheet.model.merges.length > 0, "merge should survive")
  })

  test("writes only the cells that actually changed", async () => {
    const src = path.join(dir, "patch.xlsx")
    const out = path.join(dir, "patch-out.xlsx")
    await createRichWorkbook(src)

    const model = await parseFile(src)
    model.sheets[0].rows[0][0] = "Renamed Widget"
    model.sheets[2].rows[0][0] = "edited note"

    const dirtyState: DirtyState = emptyDirtyState()
    dirtyState.cells.add(dirtyKey(0, 0, 0))
    dirtyState.cells.add(dirtyKey(2, 0, 0))

    await writeExcel(out, model, dirtyState, src)

    const saved = await readWorkbook(out)
    assert.equal(saved.getWorksheet("Data")!.getCell("A2").value, "Renamed Widget")
    assert.equal(saved.getWorksheet("Notes")!.getCell("A2").value, "edited note")
    // Untouched neighbours keep their original content and formulas.
    assert.equal(saved.getWorksheet("Data")!.getCell("A3").value, "Gadget")
    assert.equal(
      (saved.getWorksheet("Data")!.getCell("D2").value as any).formula,
      "B2*C2",
    )
  })

  test("applies a sheet rename without touching the others", async () => {
    const src = path.join(dir, "rename.xlsx")
    const out = path.join(dir, "rename-out.xlsx")
    await createRichWorkbook(src)

    const model = await parseFile(src)
    model.sheets[1].name = "Totals"

    const dirtyState = emptyDirtyState()
    dirtyState.sheetNames = true
    await writeExcel(out, model, dirtyState, src)

    const saved = await readWorkbook(out)
    assert.deepEqual(
      saved.worksheets.map((w) => w.name),
      ["Data", "Totals", "Notes"],
    )
  })

  test("rejects legacy .xls with an actionable message", async () => {
    const legacy = path.join(dir, "legacy.xls")
    fs.writeFileSync(legacy, "not really an xls")
    await assert.rejects(
      () => parseFile(legacy),
      (error: Error) => {
        assert.ok(error instanceof UnsupportedLegacyXlsError)
        assert.match(error.message, /re-save as \.xlsx/)
        return true
      },
    )
  })

  test("reads a workbook whose only sheet is empty", async () => {
    const src = path.join(dir, "empty.xlsx")
    const workbook = new (await import("exceljs")).default.Workbook()
    workbook.addWorksheet("Blank")
    await workbook.xlsx.writeFile(src)

    const model = await parseExcel(src)
    assert.equal(model.sheets.length, 1)
    assert.equal(model.sheetName, "Blank")
  })
})

describe("CSV round trip", () => {
  test("preserves CRLF, BOM, quoting and leading zeros byte-for-byte", async () => {
    const src = path.join(dir, "dialect.csv")
    const out = path.join(dir, "dialect-out.csv")
    const original =
      "﻿ID,Note,Zip\r\n001,\"Hello, world\",07030\r\n002,\"He said \"\"hi\"\"\",00501\r\n"
    writeText(src, original)

    const model = await parseFile(src)
    assert.deepEqual(model.headers, ["ID", "Note", "Zip"])
    assert.equal(model.rows[0][0], "001")
    assert.equal(model.rows[0][2], "07030")

    await writeCsv(out, model)
    assert.equal(readText(out), original)
  })

  test("preserves blank lines inside a CSV", async () => {
    const src = path.join(dir, "blanks.csv")
    const out = path.join(dir, "blanks-out.csv")
    const original = "a,b\n1,2\n\n3,4\n"
    writeText(src, original)

    const model = await parseFile(src)
    assert.equal(model.rows.length, 3)
    assert.equal(readText(src), original)

    await writeCsv(out, model)
    assert.equal(readText(out), original)
  })

  test("keeps LF files on LF and no-trailing-newline files unterminated", async () => {
    const src = path.join(dir, "lf.csv")
    const out = path.join(dir, "lf-out.csv")
    const original = "a,b\n1,2"
    writeText(src, original)

    const model = await parseFile(src)
    await writeCsv(out, model)
    assert.equal(readText(out), original)
  })

  test("round-trips a semicolon-delimited file", async () => {
    const src = path.join(dir, "semi.csv")
    const out = path.join(dir, "semi-out.csv")
    const original = "a;b\n1;2\n"
    writeText(src, original)

    const model = await parseFile(src)
    assert.equal(model.csvDialect?.delimiter, ";")
    await writeCsv(out, model)
    assert.equal(readText(out), original)
  })

  test("pads ragged rows so the grid stays rectangular", async () => {
    const src = path.join(dir, "ragged.csv")
    writeText(src, "a,b,c\n1,2\n3,4,5\n")
    const model = await parseFile(src)
    assert.equal(model.rows[0].length, 3)
    assert.equal(model.rows[0][2], "")
  })

  test("handles a completely empty CSV", async () => {
    const src = path.join(dir, "void.csv")
    writeText(src, "")
    const model = await parseFile(src)
    assert.deepEqual(model.headers, [])
    assert.deepEqual(model.rows, [])
  })
})
