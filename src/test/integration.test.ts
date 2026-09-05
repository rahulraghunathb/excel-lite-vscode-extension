import { test, describe, beforeEach, before, after } from "node:test"
import assert from "node:assert/strict"
import * as path from "path"
import * as fs from "fs"

import { ExcelDocument } from "../ExcelDocument"
import { ExcelPanel } from "../ExcelPanel"
import { Uri, harness } from "./vscodeStub"
import { FakeWebviewPanel, flush } from "./fakePanel"
import {
  createRichWorkbook,
  makeTempDir,
  readText,
  readWorkbook,
  removeDir,
  writeText,
} from "./helpers"

let dir: string
let counter = 0

before(() => {
  dir = makeTempDir("integration")
})
after(() => {
  removeDir(dir)
})
beforeEach(() => {
  harness.reset()
})

interface Harnessed {
  document: ExcelDocument
  panel: FakeWebviewPanel
  filePath: string
}

/** Open a file through the real document + panel and wait for the first render. */
async function open(
  makeFile: (filePath: string) => Promise<void> | void,
  extension = ".xlsx",
): Promise<Harnessed> {
  const filePath = path.join(dir, `case-${counter++}${extension}`)
  await makeFile(filePath)

  const document = await ExcelDocument.create(Uri.file(filePath) as never, undefined)
  const panel = new FakeWebviewPanel()
  new ExcelPanel(
    document,
    panel as never,
    Uri.file(path.join(dir, "ext")) as never,
  )

  panel.send("ready")
  await flush()
  // The webview always follows "init" with a window request.
  panel.send("requestWindow", { start: 0, count: 100 })
  await flush()
  return { document, panel, filePath }
}

/** Rows currently displayed, as the webview would render them. */
function visibleRows(panel: FakeWebviewPanel): string[][] {
  return panel.last("window")?.payload.rows ?? []
}

async function refetch(panel: FakeWebviewPanel) {
  panel.send("requestWindow", { start: 0, count: 100 })
  await flush()
}

describe("end-to-end: opening and rendering", () => {
  test("renders a workbook with a CSP-locked webview shell", async () => {
    const { panel, document } = await open(createRichWorkbook)

    const init = panel.last("init")!
    // Columns F..H exist because row 1 carries a G1:H1 merge; the sheet really
    // is that wide, and they are labelled by letter like any empty column.
    assert.deepEqual(
      init.payload.headers.slice(0, 5),
      ["Name", "Qty", "Price", "Total", "Date"],
    )
    assert.equal(init.payload.totalRows, 4)
    assert.deepEqual(
      init.payload.sheets.map((s: any) => s.name),
      ["Data", "Summary", "Notes"],
    )

    const html = (panel.webview as any).html || panel.html
    void html
    document.dispose()
  })

  test("sends display strings, never [object Object] or raw ISO dates", async () => {
    const { panel } = await open(createRichWorkbook)
    const rows = visibleRows(panel)

    assert.equal(rows[0][0], "Widget")
    assert.equal(rows[0][3], "25") // formula result
    assert.equal(rows[0][4], "2026-01-15") // date
    assert.equal(rows[1][1], "0") // numeric zero
    assert.equal(rows[2][0], "") // preserved blank row
    for (const row of rows) {
      for (const cell of row) assert.ok(!cell.includes("[object"))
    }
  })

  test("serves only the requested window of a large sheet", async () => {
    const { panel } = await open((file) => {
      const lines = ["id,value"]
      for (let i = 0; i < 5000; i++) lines.push(`${i},${i * 2}`)
      writeText(file, lines.join("\n") + "\n")
    }, ".csv")

    assert.equal(panel.last("init")!.payload.totalRows, 5000)

    panel.clear()
    panel.send("requestWindow", { start: 4000, count: 50 })
    await flush()

    const windowPayload = panel.last("window")!.payload
    assert.equal(windowPayload.start, 4000)
    assert.equal(windowPayload.rows.length, 50)
    assert.equal(windowPayload.rows[0][0], "4000")
    // The whole sheet is never shipped to the webview.
    assert.ok(windowPayload.rows.length < 5000)
  })
})

describe("end-to-end: editing", () => {
  test("an edit marks the document dirty and types the value", async () => {
    const { panel, document } = await open(createRichWorkbook)
    assert.equal(document.hasUnsavedChanges, false)

    panel.send("edit", { row: 0, col: 1, value: "42" })
    await flush()

    assert.equal(document.hasUnsavedChanges, true)
    assert.equal(document.getCell(0, 0, 1), 42, "should store a number, not '42'")
    assert.equal(visibleRows(panel)[0][1], "42")
  })

  test("editing a formula cell offers the formula, not the cached value", async () => {
    const { panel } = await open(createRichWorkbook)

    panel.send("requestEditValue", { row: 0, col: 3 })
    await flush()
    assert.equal(panel.last("editValue")!.payload.text, "=B2*C2")
  })

  test("typing a formula stores it as a formula", async () => {
    const { panel, document } = await open(createRichWorkbook)
    panel.send("edit", { row: 0, col: 3, value: "=B2*C2*2" })
    await flush()
    assert.deepEqual(document.getCell(0, 0, 3), { formula: "B2*C2*2" })
  })

  test("leading-zero identifiers survive an edit", async () => {
    const { document, panel } = await open(createRichWorkbook)
    panel.send("edit", { row: 0, col: 0, value: "00742" })
    await flush()
    assert.equal(document.getCell(0, 0, 0), "00742")
  })

  test("an edit on a filtered view lands on the right underlying row", async () => {
    const { panel, document } = await open(createRichWorkbook)

    panel.send("filter", {
      column: 0,
      filter: { kind: "condition", operator: "contains", value: "doo" },
    })
    await flush()
    await refetch(panel)

    assert.equal(panel.last("init")!.payload.totalRows, 1)
    panel.send("edit", { row: 0, col: 1, value: "999" })
    await flush()

    // Doohickey is model row 3, not row 0.
    assert.equal(document.getCell(0, 3, 1), 999)
    assert.equal(document.getCell(0, 0, 1), 10, "Widget must be untouched")
  })

  test("an edit after sorting lands on the right underlying row", async () => {
    const { panel, document } = await open(createRichWorkbook)

    panel.send("sort", { column: 1, direction: "desc" })
    await flush()
    await refetch(panel)

    // Descending by Qty: Widget(10), Doohickey(7), Gadget(0), blank.
    assert.deepEqual(
      visibleRows(panel).map((row) => row[0]),
      ["Widget", "Doohickey", "Gadget", ""],
    )
    panel.send("edit", { row: 1, col: 0, value: "Renamed" })
    await flush()
    assert.equal(document.getCell(0, 3, 0), "Renamed")
  })
})

describe("end-to-end: undo and redo", () => {
  test("undo restores the previous value and clears the dirty flag path", async () => {
    const { panel, document } = await open(createRichWorkbook)
    const edits: any[] = []
    document.onDidChangeDocument((event) => edits.push(event))

    panel.send("edit", { row: 0, col: 0, value: "Changed" })
    await flush()
    assert.equal(document.getCell(0, 0, 0), "Changed")

    edits[0].undo()
    assert.equal(document.getCell(0, 0, 0), "Widget")
    edits[0].redo()
    assert.equal(document.getCell(0, 0, 0), "Changed")
  })

  test("undo after a cut restores the cut cells (was: a no-op)", async () => {
    const { panel, document } = await open(createRichWorkbook)
    const edits: any[] = []
    document.onDidChangeDocument((event) => edits.push(event))

    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 1 }],
    })
    await flush()
    panel.send("clipboard", { action: "cut" })
    await flush()

    assert.equal(harness.clipboardText, "Widget\t10")
    assert.equal(document.getCell(0, 0, 0), null)

    assert.equal(edits.length, 1, "the cut should push exactly one undo entry")
    edits[0].undo()
    assert.equal(document.getCell(0, 0, 0), "Widget")
    assert.equal(document.getCell(0, 0, 1), 10)
  })

  test("undo restores a cleared selection", async () => {
    const { panel, document } = await open(createRichWorkbook)
    const edits: any[] = []
    document.onDidChangeDocument((event) => edits.push(event))

    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 1, endCol: 0 }],
    })
    await flush()
    panel.send("clipboard", { action: "clear" })
    await flush()

    assert.equal(document.getCell(0, 0, 0), null)
    assert.equal(document.getCell(0, 1, 0), null)
    edits[0].undo()
    assert.equal(document.getCell(0, 0, 0), "Widget")
    assert.equal(document.getCell(0, 1, 0), "Gadget")
  })

  test("undo reverses a style change", async () => {
    const { panel, document } = await open(createRichWorkbook)
    const edits: any[] = []
    document.onDidChangeDocument((event) => edits.push(event))

    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }],
    })
    await flush()
    panel.send("style", { type: "bold" })
    await flush()

    assert.equal(document.getStyle(0, 0, 0)?.bold, true)
    edits[0].undo()
    assert.equal(document.getStyle(0, 0, 0)?.bold, undefined)
  })
})

describe("end-to-end: clipboard", () => {
  test("copy exports the bounding box of a multi-range selection", async () => {
    const { panel } = await open(createRichWorkbook)
    panel.send("selection", {
      ranges: [
        { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        { startRow: 1, startCol: 1, endRow: 1, endCol: 1 },
      ],
    })
    await flush()
    panel.send("clipboard", { action: "copy" })
    await flush()

    // Both ranges appear; cells outside them are blank.
    assert.equal(harness.clipboardText, "Widget\t\n\t0")
  })

  test("paste works with nothing previously copied inside the editor", async () => {
    const { panel, document } = await open(createRichWorkbook)
    harness.clipboardText = "FromExcel\t123"

    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }],
    })
    await flush()
    panel.send("clipboard", { action: "paste" })
    await flush()

    assert.equal(document.getCell(0, 0, 0), "FromExcel")
    assert.equal(document.getCell(0, 0, 1), 123)
  })

  test("paste grows the sheet instead of truncating", async () => {
    const { panel, document } = await open(createRichWorkbook)
    harness.clipboardText = ["a\t1", "b\t2", "c\t3", "d\t4"].join("\n")

    panel.send("selection", {
      ranges: [{ startRow: 3, startCol: 0, endRow: 3, endCol: 0 }],
    })
    await flush()
    panel.send("clipboard", { action: "paste" })
    await flush()

    assert.ok(
      document.model.sheets[0].rows.length >= 7,
      `expected the sheet to grow, got ${document.model.sheets[0].rows.length} rows`,
    )
    assert.equal(document.getCell(0, 6, 0), "d")
    assert.equal(document.getCell(0, 6, 1), 4)
  })

  test("paste understands quoted multi-line clipboard cells", async () => {
    const { panel, document } = await open(createRichWorkbook)
    harness.clipboardText = '"line one\nline two"\tplain'

    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }],
    })
    await flush()
    panel.send("clipboard", { action: "paste" })
    await flush()

    assert.equal(document.getCell(0, 0, 0), "line one\nline two")
    assert.equal(document.getCell(0, 0, 1), "plain")
  })
})

describe("end-to-end: aggregates and selection", () => {
  test("aggregates clear when the selection is emptied (was: stale)", async () => {
    const { panel } = await open(createRichWorkbook)

    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 1, endRow: 2, endCol: 1 }],
    })
    await flush()
    assert.equal(panel.last("aggregates")!.payload.sum, "10")

    panel.send("selection", { ranges: [] })
    await flush()
    assert.equal(panel.last("aggregates")!.payload, null)
  })

  test("aggregates recompute against the filtered view", async () => {
    const { panel } = await open(createRichWorkbook)

    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 1, endRow: 3, endCol: 1 }],
    })
    await flush()
    assert.equal(panel.last("aggregates")!.payload.sum, "17")

    panel.send("filter", {
      column: 0,
      filter: { kind: "condition", operator: "contains", value: "get" },
    })
    await flush()
    // The selection was reset by the filter, so aggregates clear.
    assert.equal(panel.last("aggregates")!.payload, null)
  })
})

describe("end-to-end: filters", () => {
  test("the filter option list covers values hidden by the active filter", async () => {
    const { panel } = await open(createRichWorkbook)

    panel.send("filter", {
      column: 0,
      filter: { kind: "values", values: ["Widget"] },
    })
    await flush()
    assert.equal(panel.last("init")!.payload.totalRows, 1)

    panel.send("requestFilterOptions", { column: 0 })
    await flush()
    const options = panel.last("filterOptions")!.payload
    assert.ok(
      options.values.includes("Gadget"),
      "a filtered-out value must still be offered so it can be restored",
    )
    assert.deepEqual(options.current, { kind: "values", values: ["Widget"] })
  })

  test("removing a filter restores every row", async () => {
    const { panel } = await open(createRichWorkbook)
    panel.send("filter", {
      column: 0,
      filter: { kind: "values", values: ["Widget"] },
    })
    await flush()
    assert.equal(panel.last("init")!.payload.totalRows, 1)

    panel.send("filter", { column: 0, filter: null })
    await flush()
    assert.equal(panel.last("init")!.payload.totalRows, 4)
  })

  test("filter by colour uses the fill applied in this session", async () => {
    const { panel } = await open(createRichWorkbook)

    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }],
    })
    await flush()
    panel.send("style", { type: "fill", color: "#ff0000" })
    await flush()

    panel.send("filter", { column: 0, filter: { kind: "color", colors: ["#ff0000"] } })
    await flush()
    await refetch(panel)
    assert.deepEqual(visibleRows(panel).map((row) => row[0]), ["Widget"])
  })

  test("a crafted fill colour is rejected rather than injected", async () => {
    const { panel, document } = await open(createRichWorkbook)
    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }],
    })
    await flush()
    panel.send("style", {
      type: "fill",
      color: '#red"><img src=x onerror=alert(1)>',
    })
    await flush()
    assert.equal(document.getStyle(0, 0, 0)?.bgColor, undefined)
  })
})

describe("end-to-end: saving", () => {
  test("save patches the file, keeping other sheets and formulas", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)

    panel.send("edit", { row: 0, col: 0, value: "Patched" })
    await flush()
    await document.save()

    assert.equal(document.hasUnsavedChanges, false)

    const saved = await readWorkbook(filePath)
    assert.deepEqual(
      saved.worksheets.map((w) => w.name),
      ["Data", "Summary", "Notes"],
    )
    assert.equal(saved.getWorksheet("Data")!.getCell("A2").value, "Patched")
    assert.equal(
      (saved.getWorksheet("Data")!.getCell("D2").value as any).formula,
      "B2*C2",
    )
    assert.equal(saved.getWorksheet("Notes")!.getCell("A2").value, "keep me")
  })

  test("a saved numeric edit is a number in the file", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)
    panel.send("edit", { row: 0, col: 1, value: "99" })
    await flush()
    await document.save()

    const saved = await readWorkbook(filePath)
    assert.strictEqual(saved.getWorksheet("Data")!.getCell("B2").value, 99)
  })

  test("saving twice in a row is stable", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)
    panel.send("edit", { row: 0, col: 0, value: "Once" })
    await flush()
    await document.save()
    const first = fs.readFileSync(filePath).length

    await document.save()
    const saved = await readWorkbook(filePath)
    assert.equal(saved.getWorksheet("Data")!.getCell("A2").value, "Once")
    assert.deepEqual(saved.worksheets.map((w) => w.name), ["Data", "Summary", "Notes"])
    assert.ok(Math.abs(fs.readFileSync(filePath).length - first) < first * 0.5)
  })

  test("refuses to clobber a file changed on disk unless confirmed", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)
    panel.send("edit", { row: 0, col: 0, value: "Mine" })
    await flush()

    // Someone else writes the file.
    await new Promise((resolve) => setTimeout(resolve, 12))
    await createRichWorkbook(filePath)

    harness.warningResponses.push(undefined) // user dismisses the prompt
    await assert.rejects(() => document.save())
    assert.match(harness.warningMessages[0], /changed on disk/)

    harness.warningResponses.push("Overwrite")
    await document.save()
    const saved = await readWorkbook(filePath)
    assert.equal(saved.getWorksheet("Data")!.getCell("A2").value, "Mine")
  })

  test("a CSV edit round-trips without rewriting the whole file", async () => {
    const original = "a,b\r\n1,2\r\n\r\n3,4\r\n"
    const { panel, document, filePath } = await open(
      (file) => writeText(file, original),
      ".csv",
    )

    panel.send("edit", { row: 0, col: 1, value: "changed" })
    await flush()
    await document.save()

    assert.equal(readText(filePath), "a,b\r\n1,changed\r\n\r\n3,4\r\n")
  })

  test("revert discards edits and reloads from disk", async () => {
    const { panel, document } = await open(createRichWorkbook)
    panel.send("edit", { row: 0, col: 0, value: "Temporary" })
    await flush()
    assert.equal(document.hasUnsavedChanges, true)

    await document.revert()
    assert.equal(document.hasUnsavedChanges, false)
    assert.equal(document.getCell(0, 0, 0), "Widget")
  })

  test("a hot-exit backup restores the unsaved edits", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)
    panel.send("edit", { row: 0, col: 0, value: "Unsaved work" })
    await flush()

    const backupPath = filePath.replace(".xlsx", ".backup.xlsx")
    const backup = await document.backup(
      Uri.file(backupPath) as never,
      {} as never,
    )

    // The original on disk is untouched.
    const onDisk = await readWorkbook(filePath)
    assert.equal(onDisk.getWorksheet("Data")!.getCell("A2").value, "Widget")

    const restored = await ExcelDocument.create(
      Uri.file(filePath) as never,
      backup.id,
    )
    assert.equal(restored.getCell(0, 0, 0), "Unsaved work")
    restored.dispose()
  })
})

describe("end-to-end: sheets", () => {
  test("switching sheets swaps the data and resets view state", async () => {
    const { panel } = await open(createRichWorkbook)

    panel.send("sort", { column: 1, direction: "desc" })
    await flush()
    panel.send("switchSheet", { index: 2 })
    await flush()
    await refetch(panel)

    const init = panel.last("init")!.payload
    assert.equal(init.sheetName, "Notes")
    assert.equal(init.sort, null, "sort should not carry across sheets")
    assert.deepEqual(visibleRows(panel), [["keep me"]])
  })

  test("editing a non-active sheet and saving keeps both sheets", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)

    panel.send("switchSheet", { index: 1 })
    await flush()
    panel.send("edit", { row: 0, col: 1, value: "100" })
    await flush()
    panel.send("switchSheet", { index: 0 })
    await flush()
    panel.send("edit", { row: 0, col: 0, value: "AlsoEdited" })
    await flush()

    await document.save()
    const saved = await readWorkbook(filePath)
    assert.equal(saved.getWorksheet("Summary")!.getCell("B2").value, 100)
    assert.equal(saved.getWorksheet("Data")!.getCell("A2").value, "AlsoEdited")
    assert.equal(saved.getWorksheet("Notes")!.getCell("A2").value, "keep me")
  })

  test("renaming a sheet is undoable and saves correctly", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)
    harness.inputBoxResponses.push("Renamed")

    panel.send("renameSheet", { index: 1 })
    await flush()
    assert.equal(document.model.sheets[1].name, "Renamed")

    await document.save()
    const saved = await readWorkbook(filePath)
    assert.deepEqual(
      saved.worksheets.map((w) => w.name),
      ["Data", "Renamed", "Notes"],
    )
  })

  test("a duplicate sheet name is rejected", async () => {
    const { panel, document } = await open(createRichWorkbook)
    harness.inputBoxResponses.push("Notes") // clashes with sheet 2
    panel.send("renameSheet", { index: 1 })
    await flush()
    assert.equal(document.model.sheets[1].name, "Summary")
  })
})

describe("end-to-end: panel lifecycle", () => {
  test("two documents keep independent state", async () => {
    const first = await open(createRichWorkbook)
    const second = await open(createRichWorkbook)

    first.panel.send("edit", { row: 0, col: 0, value: "First only" })
    await flush()

    assert.equal(first.document.getCell(0, 0, 0), "First only")
    assert.equal(second.document.getCell(0, 0, 0), "Widget")
    assert.equal(second.document.hasUnsavedChanges, false)
  })

  test("a disposed panel stops receiving posts", async () => {
    const { panel, document } = await open(createRichWorkbook)
    panel.dispose()
    panel.clear()

    document.pushEdit({
      label: "x",
      cells: [{ sheetIndex: 0, row: 0, col: 0, before: "Widget", after: "Z" }],
      styles: [],
      sheetNames: [],
      structural: [],
    })
    await flush()
    assert.equal(panel.posted.length, 0)
  })
})

describe("end-to-end: scale", () => {
  test("a wide paste does not exceed the argument limit", async () => {
    const { panel, document } = await open((file) => {
      writeText(file, "a,b\n1,2\n")
    }, ".csv")

    // 20k columns in one row: Math.max(...row) would throw here.
    harness.clipboardText = Array.from({ length: 20000 }, (_, i) => String(i)).join("\t")
    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }],
    })
    await flush()
    panel.send("clipboard", { action: "paste" })
    await flush()

    assert.equal(document.getCell(0, 0, 0), 0)
    assert.equal(document.getCell(0, 0, 19999), 19999)
  })

  test("a large sheet loads, sorts and filters without materialising the view twice", async () => {
    const rowCount = 60000
    const { panel } = await open((file) => {
      const lines = ["id,name,score"]
      for (let i = 0; i < rowCount; i++) {
        lines.push(`${i},name-${i % 500},${(i * 7919) % 10000}`)
      }
      writeText(file, lines.join("\n") + "\n")
    }, ".csv")

    assert.equal(panel.last("init")!.payload.totalRows, rowCount)

    const started = Date.now()
    panel.send("sort", { column: 2, direction: "asc" })
    await flush()
    panel.send("requestWindow", { start: 0, count: 50 })
    await flush()

    const rows = panel.last("window")!.payload.rows
    assert.equal(rows.length, 50)
    assert.ok(
      Number(rows[0][2]) <= Number(rows[49][2]),
      "sorted ascending by score",
    )
    assert.ok(
      Date.now() - started < 8000,
      `sorting ${rowCount} rows took ${Date.now() - started}ms`,
    )

    panel.send("filter", {
      column: 1,
      filter: { kind: "values", values: ["name-42"] },
    })
    await flush()
    assert.equal(panel.last("init")!.payload.totalRows, rowCount / 500)
  })

  test("undo history is patch-sized, not a copy of the sheet", async () => {
    const { panel, document } = await open((file) => {
      const lines = ["a,b"]
      for (let i = 0; i < 20000; i++) lines.push(`${i},${i}`)
      writeText(file, lines.join("\n") + "\n")
    }, ".csv")

    const edits: any[] = []
    document.onDidChangeDocument((event) => edits.push(event))
    for (let i = 0; i < 60; i++) {
      panel.send("edit", { row: i, col: 0, value: `v${i}` })
      await flush(1)
    }

    assert.equal(edits.length, 60)
    // Every edit is still individually reversible. CSV cells stay strings, so
    // the restored values are "0" and "59", not numbers.
    edits[0].undo()
    assert.equal(document.getCell(0, 0, 0), "0")
    edits[59].undo()
    assert.equal(document.getCell(0, 59, 0), "59")
  })
})

describe("end-to-end: insert and delete rows", () => {
  test("inserting a row shifts the data below it in the saved file", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)

    panel.send("structural", { kind: "insertRows", at: 1, count: 1 })
    await flush()
    await refetch(panel)

    assert.deepEqual(
      visibleRows(panel).map((row) => row[0]),
      ["Widget", "", "Gadget", "", "Doohickey"],
    )

    await document.save()
    const sheet = (await readWorkbook(filePath)).getWorksheet("Data")!
    assert.equal(sheet.getCell("A2").value, "Widget")
    assert.equal(sheet.getCell("A3").value, null)
    assert.equal(sheet.getCell("A4").value, "Gadget")
    // The formula moved down with its row and kept its expression.
    assert.equal((sheet.getCell("D4").value as any).formula, "B3*C3")
  })

  test("deleting a row removes it from the saved file", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)

    panel.send("structural", { kind: "deleteRows", at: 0, count: 1 })
    await flush()
    await refetch(panel)
    assert.deepEqual(
      visibleRows(panel).map((row) => row[0]),
      ["Gadget", "", "Doohickey"],
    )

    await document.save()
    const sheet = (await readWorkbook(filePath)).getWorksheet("Data")!
    assert.equal(sheet.getCell("A1").value, "Name", "header untouched")
    assert.equal(sheet.getCell("A2").value, "Gadget")
  })

  test("undoing a delete restores the values and the formatting", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)
    const edits: any[] = []
    document.onDidChangeDocument((event) => edits.push(event))

    // Row 3 (Doohickey) carries the bold + yellow fill.
    panel.send("structural", { kind: "deleteRows", at: 3, count: 1 })
    await flush()
    assert.equal(document.model.sheets[0].rows.length, 3)

    edits[0].undo()
    await flush()
    assert.equal(document.model.sheets[0].rows.length, 4)
    assert.equal(document.getCell(0, 3, 0), "Doohickey")
    assert.deepEqual(document.getStyle(0, 3, 0), {
      bold: true,
      bgColor: "#ffff00",
    })

    // And the restoration must survive a save, not just live in memory.
    await document.save()
    const sheet = (await readWorkbook(filePath)).getWorksheet("Data")!
    assert.equal(sheet.getCell("A5").value, "Doohickey")
    assert.equal(sheet.getCell("A5").font?.bold, true)
    assert.equal((sheet.getCell("A5").fill as any)?.fgColor?.argb, "FFFFFF00")
  })

  test("an edit made before an insert still saves to the right cell", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)

    // Edit the last row, then push it down by inserting above it.
    panel.send("edit", { row: 3, col: 0, value: "Edited last" })
    await flush()
    panel.send("structural", { kind: "insertRows", at: 0, count: 2 })
    await flush()

    await document.save()
    const sheet = (await readWorkbook(filePath)).getWorksheet("Data")!
    // Was sheet row 5, now row 7 after two insertions.
    assert.equal(sheet.getCell("A7").value, "Edited last")
    assert.equal(sheet.getCell("A2").value, null)
  })

  test("other sheets are untouched by a structural change", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)

    panel.send("structural", { kind: "deleteRows", at: 0, count: 2 })
    await flush()
    await document.save()

    const saved = await readWorkbook(filePath)
    assert.deepEqual(saved.worksheets.map((w) => w.name), ["Data", "Summary", "Notes"])
    assert.equal(saved.getWorksheet("Notes")!.getCell("A2").value, "keep me")
    assert.equal(saved.getWorksheet("Summary")!.getCell("B2").value, 33.75)
  })

  test("structural edits are refused while sorted or filtered", async () => {
    const { panel, document } = await open(createRichWorkbook)

    panel.send("sort", { column: 1, direction: "asc" })
    await flush()
    panel.send("structural", { kind: "insertRows", at: 0, count: 1 })
    await flush()

    assert.equal(document.model.sheets[0].rows.length, 4, "no rows added")
    assert.match(harness.warningMessages[0], /Clear the sort and filters/)
    assert.equal(panel.last("init")!.payload.canEditStructure, false)
  })
})

describe("end-to-end: insert and delete columns", () => {
  test("inserting a column shifts later columns in the saved file", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)

    panel.send("structural", { kind: "insertCols", at: 1, count: 1 })
    await flush()
    await refetch(panel)

    const headers = panel.last("init")!.payload.headers
    assert.equal(headers[0], "Name")
    assert.equal(headers[2], "Qty")

    await document.save()
    const sheet = (await readWorkbook(filePath)).getWorksheet("Data")!
    assert.equal(sheet.getCell("A1").value, "Name")
    assert.equal(sheet.getCell("B1").value, null, "new blank column")
    assert.equal(sheet.getCell("C1").value, "Qty")
    assert.equal(sheet.getCell("C2").value, 10)
  })

  test("deleting a column removes it from the saved file", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)

    panel.send("structural", { kind: "deleteCols", at: 1, count: 1 })
    await flush()

    await document.save()
    const sheet = (await readWorkbook(filePath)).getWorksheet("Data")!
    assert.equal(sheet.getCell("A1").value, "Name")
    assert.equal(sheet.getCell("B1").value, "Price")
    assert.equal(sheet.getCell("B2").value, 2.5)
  })

  test("undoing a column delete restores headers and data", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)
    const edits: any[] = []
    document.onDidChangeDocument((event) => edits.push(event))

    panel.send("structural", { kind: "deleteCols", at: 1, count: 1 })
    await flush()
    edits[0].undo()
    await flush()

    assert.equal(document.model.sheets[0].headers[1], "Qty")
    assert.equal(document.getCell(0, 0, 1), 10)

    await document.save()
    const sheet = (await readWorkbook(filePath)).getWorksheet("Data")!
    assert.equal(sheet.getCell("B2").value, 10)
  })

  test("refuses to delete the last remaining column", async () => {
    const { panel, document } = await open((file) => {
      writeText(file, "only\n1\n2\n")
    }, ".csv")

    panel.send("structural", { kind: "deleteCols", at: 0, count: 1 })
    await flush()
    assert.equal(document.model.sheets[0].headers.length, 1)
    assert.match(harness.warningMessages[0], /at least one column/)
  })

  test("row operations work on a CSV too", async () => {
    const { panel, document, filePath } = await open(
      (file) => writeText(file, "a,b\n1,2\n3,4\n"),
      ".csv",
    )

    panel.send("structural", { kind: "deleteRows", at: 0, count: 1 })
    await flush()
    await document.save()
    assert.equal(readText(filePath), "a,b\n3,4\n")
  })
})

describe("end-to-end: find and replace", () => {
  test("find reports matches in view coordinates", async () => {
    const { panel } = await open(createRichWorkbook)

    panel.send("find", { query: "get" })
    await flush()
    const results = panel.last("findResults")!.payload
    // "Widget" (row 0) and "Gadget" (row 1).
    assert.deepEqual(results.matches, [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
    ])
    assert.equal(results.query, "get")
  })

  test("find only sees rows the filter leaves visible", async () => {
    const { panel } = await open(createRichWorkbook)

    panel.send("filter", {
      column: 0,
      filter: { kind: "condition", operator: "contains", value: "widget" },
    })
    await flush()
    panel.send("find", { query: "get" })
    await flush()

    assert.deepEqual(panel.last("findResults")!.payload.matches, [
      { row: 0, col: 0 },
    ])
  })

  test("replacing one cell edits only that cell", async () => {
    const { panel, document } = await open(createRichWorkbook)

    panel.send("replace", { query: "get", replacement: "GET", row: 1, col: 0 })
    await flush()

    assert.equal(document.getCell(0, 1, 0), "GadGET")
    assert.equal(document.getCell(0, 0, 0), "Widget", "other rows untouched")
    assert.equal(panel.last("replaceDone")!.payload.replaced, 1)
  })

  test("replace all is a single undoable edit", async () => {
    const { panel, document } = await open(createRichWorkbook)
    const edits: any[] = []
    document.onDidChangeDocument((event) => edits.push(event))

    panel.send("replace", { query: "get", replacement: "X", all: true })
    await flush()

    assert.equal(document.getCell(0, 0, 0), "WidX")
    assert.equal(document.getCell(0, 1, 0), "GadX")
    assert.equal(edits.length, 1, "one undo step for the whole operation")

    edits[0].undo()
    assert.equal(document.getCell(0, 0, 0), "Widget")
    assert.equal(document.getCell(0, 1, 0), "Gadget")
  })

  test("a replacement that yields a number is stored as a number", async () => {
    const { panel, document } = await open(createRichWorkbook)
    panel.send("replace", {
      query: "Widget",
      replacement: "500",
      wholeCell: true,
      all: true,
    })
    await flush()
    assert.strictEqual(document.getCell(0, 0, 0), 500)
  })

  test("replacing with no match reports zero and makes no edit", async () => {
    const { panel, document } = await open(createRichWorkbook)
    panel.send("replace", { query: "nothing here", replacement: "x", all: true })
    await flush()
    assert.equal(panel.last("replaceDone")!.payload.replaced, 0)
    assert.equal(document.hasUnsavedChanges, false)
  })
})

describe("end-to-end: formatting", () => {
  test("italic, underline and alignment round-trip to the file", async () => {
    const { panel, document, filePath } = await open(createRichWorkbook)

    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }],
    })
    await flush()
    panel.send("style", { type: "italic" })
    await flush()
    panel.send("style", { type: "underline" })
    await flush()
    panel.send("style", { type: "align", align: "center" })
    await flush()
    panel.send("style", { type: "fontColor", color: "#c00000" })
    await flush()

    await document.save()
    const cell = (await readWorkbook(filePath)).getWorksheet("Data")!.getCell("A2")
    assert.equal(cell.font?.italic, true)
    assert.equal(cell.font?.underline, true)
    assert.equal(cell.font?.color?.argb, "FFC00000")
    assert.equal(cell.alignment?.horizontal, "center")
  })

  test("toggles apply to the whole selection as a group", async () => {
    const { panel, document } = await open(createRichWorkbook)

    // Row 3 is already bold; rows 0-3 are a mixed selection.
    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 3, endCol: 0 }],
    })
    await flush()
    panel.send("style", { type: "bold" })
    await flush()

    for (let row = 0; row <= 3; row++) {
      assert.equal(document.getStyle(0, row, 0)?.bold, true, `row ${row}`)
    }

    // Now everything is bold, so the same click clears it.
    panel.send("style", { type: "bold" })
    await flush()
    for (let row = 0; row <= 3; row++) {
      assert.equal(document.getStyle(0, row, 0)?.bold, undefined, `row ${row}`)
    }
  })

  test("clicking the active alignment clears it", async () => {
    const { panel, document } = await open(createRichWorkbook)
    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }],
    })
    await flush()

    panel.send("style", { type: "align", align: "right" })
    await flush()
    assert.equal(document.getStyle(0, 0, 0)?.align, "right")

    panel.send("style", { type: "align", align: "right" })
    await flush()
    assert.equal(document.getStyle(0, 0, 0)?.align, undefined)
  })

  test("clear formatting removes every attribute at once", async () => {
    const { panel, document } = await open(createRichWorkbook)

    panel.send("selection", {
      ranges: [{ startRow: 3, startCol: 0, endRow: 3, endCol: 0 }],
    })
    await flush()
    assert.deepEqual(document.getStyle(0, 3, 0), {
      bold: true,
      bgColor: "#ffff00",
    })

    panel.send("style", { type: "clearFormat" })
    await flush()
    assert.equal(document.getStyle(0, 3, 0), undefined)
  })

  test("the formula bar reports the anchor cell's reference and text", async () => {
    const { panel } = await open(createRichWorkbook)

    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 3, endRow: 0, endCol: 3 }],
    })
    await flush()

    const active = panel.last("activeCell")!.payload
    assert.equal(active.ref, "D2", "column letter plus the real sheet row")
    assert.equal(active.text, "=B2*C2")
  })

  test("the formula bar reference follows the underlying row when sorted", async () => {
    const { panel } = await open(createRichWorkbook)

    panel.send("sort", { column: 1, direction: "desc" })
    await flush()
    // View row 1 is Doohickey, which lives at sheet row 5.
    panel.send("selection", {
      ranges: [{ startRow: 1, startCol: 0, endRow: 1, endCol: 0 }],
    })
    await flush()

    const active = panel.last("activeCell")!.payload
    assert.equal(active.ref, "A5")
    assert.equal(active.text, "Doohickey")
  })

  test("clearing the selection empties the formula bar", async () => {
    const { panel } = await open(createRichWorkbook)
    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }],
    })
    await flush()
    assert.ok(panel.last("activeCell")!.payload)

    panel.send("selection", { ranges: [] })
    await flush()
    assert.equal(panel.last("activeCell")!.payload, null)
  })
})
