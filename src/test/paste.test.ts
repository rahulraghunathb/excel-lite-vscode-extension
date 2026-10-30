import { test, describe, beforeEach, before, after } from "node:test"
import assert from "node:assert/strict"
import * as path from "path"

import { ExcelDocument } from "../ExcelDocument"
import { ExcelPanel } from "../ExcelPanel"
import { Uri, harness } from "./vscodeStub"
import { FakeWebviewPanel, flush } from "./fakePanel"
import { createRichWorkbook, makeTempDir, removeDir } from "./helpers"

let dir: string
let counter = 0

before(() => {
  dir = makeTempDir("paste")
})
after(() => {
  removeDir(dir)
})
beforeEach(() => {
  harness.reset()
})

async function open() {
  const filePath = path.join(dir, `paste-${counter++}.xlsx`)
  await createRichWorkbook(filePath)
  const document = await ExcelDocument.create(Uri.file(filePath) as never, undefined)
  const panel = new FakeWebviewPanel()
  new ExcelPanel(document, panel as never, Uri.file(path.join(dir, "ext")) as never)
  panel.send("ready")
  await flush()
  return { panel, document }
}

describe("paste into a selected range", () => {
  test("a single value fills every cell of the selection", async () => {
    const { panel, document } = await open()

    harness.clipboardText = "Z"
    // Rows 0 to 3 of the Name column: Widget, Gadget, blank, Doohickey.
    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 3, endCol: 0 }],
    })
    await flush()
    panel.send("clipboard", { action: "paste" })
    await flush()

    assert.deepEqual(
      [0, 1, 2, 3].map((row) => document.getCell(0, row, 0)),
      ["Z", "Z", "Z", "Z"],
    )
    assert.equal(document.getCell(0, 0, 1), 10, "other columns must be untouched")
  })

  test("a single value fills only the visible cells of a filtered selection", async () => {
    const { panel, document } = await open()

    panel.send("filter", {
      column: 1,
      filter: { kind: "condition", operator: "gt", value: "0" },
    })
    await flush()

    harness.clipboardText = "Z"
    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 1, endCol: 0 }],
    })
    await flush()
    panel.send("clipboard", { action: "paste" })
    await flush()

    assert.equal(document.getCell(0, 0, 0), "Z")
    assert.equal(document.getCell(0, 3, 0), "Z")
    assert.equal(document.getCell(0, 1, 0), "Gadget", "hidden row must be untouched")
  })
})

describe("paste on a filtered view", () => {
  test("fills only the visible rows, skipping the hidden ones in between", async () => {
    const { panel, document } = await open()

    // Qty > 0 keeps Widget (model row 0) and Doohickey (model row 3); the
    // Gadget and blank rows in between are hidden.
    panel.send("filter", {
      column: 1,
      filter: { kind: "condition", operator: "gt", value: "0" },
    })
    await flush()

    harness.clipboardText = "X\t1\nY\t2"
    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }],
    })
    await flush()
    panel.send("clipboard", { action: "paste" })
    await flush()

    assert.equal(document.getCell(0, 0, 0), "X", "first visible row takes the first pasted row")
    assert.equal(document.getCell(0, 3, 0), "Y", "second visible row takes the second pasted row")
    assert.equal(document.getCell(0, 1, 0), "Gadget", "hidden row must be untouched")
    assert.equal(document.getCell(0, 2, 0), null, "hidden blank row must be untouched")
  })

  test("a paste longer than the visible rows stops instead of writing to hidden rows", async () => {
    const { panel, document } = await open()

    panel.send("filter", {
      column: 0,
      filter: { kind: "condition", operator: "contains", value: "doo" },
    })
    await flush()

    harness.clipboardText = "X\t1\nY\t2"
    panel.send("selection", {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }],
    })
    await flush()
    panel.send("clipboard", { action: "paste" })
    await flush()

    assert.equal(document.getCell(0, 3, 0), "X")
    assert.equal(document.getCell(0, 0, 0), "Widget", "Widget is hidden and must stay untouched")
    assert.equal(document.getCell(0, 1, 0), "Gadget", "Gadget is hidden and must stay untouched")
  })
})
