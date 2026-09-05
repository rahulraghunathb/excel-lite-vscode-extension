import { test, describe } from "node:test"
import assert from "node:assert/strict"

import {
  StructuralOp,
  applyStructural,
  invertStructural,
  restoreRemoved,
  shiftDirtyKeys,
} from "../structural"
import { CellStyle, CellValue } from "../model"

function makeTarget() {
  return {
    headers: ["A", "B", "C"],
    rows: [
      ["a0", "b0", "c0"],
      ["a1", "b1", "c1"],
      ["a2", "b2", "c2"],
    ] as CellValue[][],
    styles: new Map<string, CellStyle>([
      ["0,0", { bold: true }],
      ["2,2", { bgColor: "#ff0000" }],
    ]),
  }
}

function op(partial: Partial<StructuralOp>): StructuralOp {
  return { sheetIndex: 0, kind: "insertRows", at: 0, count: 1, ...partial }
}

describe("row insertion", () => {
  test("inserts blank rows and shifts the ones below", () => {
    const target = makeTarget()
    applyStructural(target, op({ kind: "insertRows", at: 1, count: 2 }))

    assert.equal(target.rows.length, 5)
    assert.equal(target.rows[0][0], "a0")
    assert.deepEqual(target.rows[1], [null, null, null])
    assert.deepEqual(target.rows[2], [null, null, null])
    assert.equal(target.rows[3][0], "a1")
  })

  test("moves styles down with their row", () => {
    const target = makeTarget()
    applyStructural(target, op({ kind: "insertRows", at: 1, count: 2 }))

    // Row 0 is above the insertion point and stays put.
    assert.deepEqual(target.styles.get("0,0"), { bold: true })
    // Row 2 was below it and moves to row 4.
    assert.equal(target.styles.get("2,2"), undefined)
    assert.deepEqual(target.styles.get("4,2"), { bgColor: "#ff0000" })
  })

  test("appending at the end works", () => {
    const target = makeTarget()
    applyStructural(target, op({ kind: "insertRows", at: 3, count: 1 }))
    assert.equal(target.rows.length, 4)
    assert.deepEqual(target.rows[3], [null, null, null])
  })
})

describe("row deletion", () => {
  test("removes rows and pulls the rest up", () => {
    const target = makeTarget()
    applyStructural(target, op({ kind: "deleteRows", at: 0, count: 2 }))

    assert.equal(target.rows.length, 1)
    assert.equal(target.rows[0][0], "a2")
  })

  test("drops styles inside the removed band and shifts the rest", () => {
    const target = makeTarget()
    applyStructural(target, op({ kind: "deleteRows", at: 0, count: 2 }))

    assert.equal(target.styles.get("0,0"), undefined, "removed with its row")
    assert.deepEqual(
      target.styles.get("0,2"),
      { bgColor: "#ff0000" },
      "row 2 moved up to row 0",
    )
  })

  test("captures what it removed for undo", () => {
    const target = makeTarget()
    const applied = applyStructural(
      target,
      op({ kind: "deleteRows", at: 0, count: 2 }),
    )

    assert.equal(applied.removedRows?.length, 2)
    assert.equal(applied.removedRows?.[0][0], "a0")
    assert.deepEqual(applied.removedStyles, [["0,0", { bold: true }]])
  })
})

describe("column insertion and deletion", () => {
  test("inserts a column into headers and every row", () => {
    const target = makeTarget()
    applyStructural(target, op({ kind: "insertCols", at: 1, count: 1 }))

    assert.equal(target.headers.length, 4)
    assert.equal(target.rows[0].length, 4)
    assert.equal(target.rows[0][0], "a0")
    assert.equal(target.rows[0][1], null)
    assert.equal(target.rows[0][2], "b0")
  })

  test("re-letters placeholder headers after an insert", () => {
    const target = makeTarget()
    applyStructural(target, op({ kind: "insertCols", at: 1, count: 1 }))
    // All three original headers were bare letters, so they re-derive.
    assert.deepEqual(target.headers, ["A", "B", "C", "D"])
  })

  test("leaves real headers alone", () => {
    const target = makeTarget()
    target.headers = ["Name", "Qty", "Price"]
    applyStructural(target, op({ kind: "insertCols", at: 1, count: 1 }))
    assert.deepEqual(target.headers, ["Name", "B", "Qty", "Price"])
  })

  test("deletes a column and shifts styles left", () => {
    const target = makeTarget()
    applyStructural(target, op({ kind: "deleteCols", at: 0, count: 1 }))

    assert.deepEqual(target.headers, ["B", "C"])
    assert.equal(target.rows[0][0], "b0")
    assert.equal(target.styles.get("0,0"), undefined, "col 0 style removed")
    assert.deepEqual(target.styles.get("2,1"), { bgColor: "#ff0000" })
  })
})

describe("undo round trip", () => {
  test("insert then inverse restores the original", () => {
    const target = makeTarget()
    const before = JSON.stringify(target.rows)

    const operation = op({ kind: "insertRows", at: 1, count: 2 })
    applyStructural(target, operation)
    applyStructural(target, invertStructural(operation))

    assert.equal(JSON.stringify(target.rows), before)
    assert.deepEqual(target.styles.get("0,0"), { bold: true })
    assert.deepEqual(target.styles.get("2,2"), { bgColor: "#ff0000" })
  })

  test("delete then inverse plus restore returns the data and styles", () => {
    const target = makeTarget()
    const before = JSON.stringify(target.rows)

    const operation = op({ kind: "deleteRows", at: 0, count: 2 })
    const applied = applyStructural(target, operation)

    // Undo: make room again, then put the content back.
    applyStructural(target, invertStructural(applied))
    const restored = restoreRemoved(target, applied)

    assert.equal(JSON.stringify(target.rows), before)
    assert.deepEqual(target.styles.get("0,0"), { bold: true })
    assert.deepEqual(target.styles.get("2,2"), { bgColor: "#ff0000" })
    assert.equal(restored.cells.length, 6, "two rows of three cells")
    assert.deepEqual(restored.styles, [{ row: 0, col: 0 }])
  })

  test("column delete round trips headers and data", () => {
    const target = makeTarget()
    target.headers = ["Name", "Qty", "Price"]
    const before = JSON.stringify({ h: target.headers, r: target.rows })

    const operation = op({ kind: "deleteCols", at: 1, count: 1 })
    const applied = applyStructural(target, operation)
    assert.deepEqual(target.headers, ["Name", "Price"])

    applyStructural(target, invertStructural(applied))
    restoreRemoved(target, applied)

    assert.equal(JSON.stringify({ h: target.headers, r: target.rows }), before)
  })
})

describe("dirty key shifting", () => {
  test("moves keys at or after the insertion point", () => {
    const keys = new Set(["0:0,0", "0:2,1", "0:5,3"])
    const next = shiftDirtyKeys(keys, 0, "row", 2, 1)
    assert.deepEqual([...next].sort(), ["0:0,0", "0:3,1", "0:6,3"])
  })

  test("drops keys inside a deleted band", () => {
    const keys = new Set(["0:0,0", "0:2,1", "0:3,1", "0:5,3"])
    const next = shiftDirtyKeys(keys, 0, "row", 2, -2)
    assert.deepEqual([...next].sort(), ["0:0,0", "0:3,3"])
  })

  test("leaves other sheets untouched", () => {
    const keys = new Set(["0:5,0", "1:5,0"])
    const next = shiftDirtyKeys(keys, 0, "row", 0, 1)
    assert.deepEqual([...next].sort(), ["0:6,0", "1:5,0"])
  })

  test("shifts along the column axis", () => {
    const keys = new Set(["0:1,0", "0:1,4"])
    const next = shiftDirtyKeys(keys, 0, "col", 2, 3)
    assert.deepEqual([...next].sort(), ["0:1,0", "0:1,7"])
  })
})
