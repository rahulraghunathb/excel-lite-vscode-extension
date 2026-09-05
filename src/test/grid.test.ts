import { test, describe } from "node:test"
import assert from "node:assert/strict"

import {
  computeAggregates,
  cycleSort,
  getColumnValues,
  getProcessedRows,
  ColumnFilter,
} from "../grid"
import { MATCH_LIMIT, findMatches, replaceInCell } from "../search"
import {
  CellValue,
  coerceInput,
  compareValues,
  formatCellDisplay,
  formatCellEdit,
  argbToHex,
  hexToArgb,
  isEmptyStyle,
  sanitizeHexColor,
  toNumber,
} from "../model"

const D = (iso: string) => new Date(iso)

const rows: CellValue[][] = [
  ["Widget", 10, D("2026-01-15T00:00:00Z")],
  ["Gadget", 0, D("2025-02-01T00:00:00Z")],
  ["Doohickey", 7, D("2026-03-09T00:00:00Z")],
  ["Blank", null, null],
]

function filters(entries: [number, ColumnFilter][]): Map<number, ColumnFilter> {
  return new Map(entries)
}

describe("filtering", () => {
  test("filters a date column by the value shown in the popup (was: matched nothing)", () => {
    const shown = formatCellDisplay(rows[0][2])
    assert.equal(shown, "2026-01-15")

    const result = getProcessedRows(
      rows,
      filters([[2, { kind: "values", values: [shown] }]]),
      null,
    )
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0][0], "Widget")
  })

  test("keeps rows whose value is 0 (was: dropped by a falsy check)", () => {
    const result = getProcessedRows(
      rows,
      filters([[1, { kind: "values", values: ["0"] }]]),
      null,
    )
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0][0], "Gadget")
  })

  test("keeps rows whose value is FALSE", () => {
    const boolRows: CellValue[][] = [["a", false], ["b", true]]
    const result = getProcessedRows(
      boolRows,
      filters([[1, { kind: "values", values: ["FALSE"] }]]),
      null,
    )
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0][0], "a")
  })

  test("condition filters cover the full advertised operator set", () => {
    const check = (filter: ColumnFilter) =>
      getProcessedRows(rows, filters([[1, filter]]), null).rows.map((r) => r[0])

    assert.deepEqual(check({ kind: "condition", operator: "gt", value: "5" }), [
      "Widget",
      "Doohickey",
    ])
    assert.deepEqual(check({ kind: "condition", operator: "gte", value: "7" }), [
      "Widget",
      "Doohickey",
    ])
    assert.deepEqual(check({ kind: "condition", operator: "lt", value: "7" }), [
      "Gadget",
    ])
    assert.deepEqual(
      check({ kind: "condition", operator: "between", value: "1", value2: "8" }),
      ["Doohickey"],
    )
    assert.deepEqual(check({ kind: "condition", operator: "isEmpty" }), ["Blank"])
    assert.deepEqual(
      check({ kind: "condition", operator: "isNotEmpty" }).length,
      3,
    )
  })

  test("text conditions are case-insensitive", () => {
    const result = getProcessedRows(
      rows,
      filters([[0, { kind: "condition", operator: "startsWith", value: "wid" }]]),
      null,
    )
    assert.deepEqual(result.rows.map((r) => r[0]), ["Widget"])
  })

  test("filters by fill colour", () => {
    const getStyle = (row: number) =>
      row === 1 ? { bgColor: "#ffff00" } : undefined
    const result = getProcessedRows(
      rows,
      filters([[0, { kind: "color", colors: ["#ffff00"] }]]),
      null,
      getStyle,
    )
    assert.deepEqual(result.rows.map((r) => r[0]), ["Gadget"])
  })

  test("multiple column filters intersect", () => {
    const result = getProcessedRows(
      rows,
      filters([
        [1, { kind: "condition", operator: "gt", value: "5" }],
        [0, { kind: "condition", operator: "contains", value: "doo" }],
      ]),
      null,
    )
    assert.deepEqual(result.rows.map((r) => r[0]), ["Doohickey"])
  })

  test("the value list is built from all rows, not just visible ones", () => {
    // Even with a filter that hides everything, every choice must remain offered.
    assert.deepEqual(getColumnValues(rows, 1), ["0", "7", "10", ""])
  })

  test("originalIndices map view rows back to sheet rows", () => {
    const result = getProcessedRows(
      rows,
      filters([[1, { kind: "condition", operator: "gt", value: "5" }]]),
      null,
    )
    assert.deepEqual(result.originalIndices, [0, 2])
  })
})

describe("sorting", () => {
  test("sorts dates chronologically (was: alphabetical on a stringified Date)", () => {
    const result = getProcessedRows(rows, new Map(), {
      column: 2,
      direction: "asc",
    })
    assert.deepEqual(
      result.rows.map((r) => formatCellDisplay(r[2])),
      ["2025-02-01", "2026-01-15", "2026-03-09", ""],
    )
  })

  test("sorts numbers numerically, not lexicographically", () => {
    const numeric: CellValue[][] = [[2], [10], [1]]
    const result = getProcessedRows(numeric, new Map(), {
      column: 0,
      direction: "asc",
    })
    assert.deepEqual(result.rows.map((r) => r[0]), [1, 2, 10])
  })

  test("blanks sort last in both directions", () => {
    const asc = getProcessedRows(rows, new Map(), { column: 1, direction: "asc" })
    const desc = getProcessedRows(rows, new Map(), { column: 1, direction: "desc" })
    assert.equal(formatCellDisplay(asc.rows[3][1]), "")
    assert.equal(formatCellDisplay(desc.rows[3][1]), "")
  })

  test("sort is stable for equal keys", () => {
    const ties: CellValue[][] = [
      ["first", 1],
      ["second", 1],
      ["third", 1],
    ]
    const result = getProcessedRows(ties, new Map(), {
      column: 1,
      direction: "asc",
    })
    assert.deepEqual(result.rows.map((r) => r[0]), ["first", "second", "third"])
  })

  test("header clicks cycle asc -> desc -> none", () => {
    let state = cycleSort(null, 1)
    assert.equal(state.direction, "asc")
    state = cycleSort(state, 1)
    assert.equal(state.direction, "desc")
    state = cycleSort(state, 1)
    assert.equal(state.direction, "none")
    // A different column restarts the cycle.
    assert.equal(cycleSort(state, 2).direction, "asc")
  })

  test("sorting by colour groups filled cells first", () => {
    const getStyle = (row: number) =>
      row === 2 ? { bgColor: "#ff0000" } : undefined
    const result = getProcessedRows(
      rows,
      new Map(),
      { column: 0, direction: "asc", byColor: true },
      getStyle,
    )
    assert.equal(result.rows[0][0], "Doohickey")
  })
})

describe("aggregates", () => {
  test("returns null for an empty selection so the status bar can clear", () => {
    assert.equal(computeAggregates(rows, []), null)
  })

  test("counts non-empty cells and sums only numerics", () => {
    const agg = computeAggregates(rows, [
      { startRow: 0, startCol: 1, endRow: 3, endCol: 1 },
    ])
    assert.ok(agg)
    assert.equal(agg!.sum, "17")
    assert.equal(agg!.count, 3)
    assert.equal(agg!.numericCount, 3)
    assert.equal(agg!.min, "0")
    assert.equal(agg!.max, "10")
  })

  test("counts a cell once when ranges overlap", () => {
    const agg = computeAggregates(rows, [
      { startRow: 0, startCol: 1, endRow: 1, endCol: 1 },
      { startRow: 1, startCol: 1, endRow: 2, endCol: 1 },
    ])
    assert.equal(agg!.count, 3)
    assert.equal(agg!.sum, "17")
  })

  test("tolerates a selection that runs past the end of the data", () => {
    const agg = computeAggregates(rows, [
      { startRow: 0, startCol: 0, endRow: 999, endCol: 999 },
    ])
    assert.ok(agg)
    assert.equal(agg!.numericCount, 3)
  })

  test("text-only selections report a count with no sum", () => {
    const agg = computeAggregates(rows, [
      { startRow: 0, startCol: 0, endRow: 2, endCol: 0 },
    ])
    assert.equal(agg!.count, 3)
    assert.equal(agg!.numericCount, 0)
    assert.equal(agg!.sum, "")
  })

  test("avoids floating point noise in the total", () => {
    const money: CellValue[][] = [[0.1], [0.2]]
    const agg = computeAggregates(money, [
      { startRow: 0, startCol: 0, endRow: 1, endCol: 0 },
    ])
    assert.equal(agg!.sum, "0.3")
  })
})

describe("cell values", () => {
  test("typed input is recovered instead of stored as text", () => {
    assert.equal(coerceInput("42"), 42)
    assert.equal(coerceInput("-3.5"), -3.5)
    assert.equal(coerceInput("TRUE"), true)
    assert.equal(coerceInput("false"), false)
    assert.equal(coerceInput(""), null)
    assert.deepEqual(coerceInput("=A1+B1"), { formula: "A1+B1" })
    assert.ok(coerceInput("2026-01-15") instanceof Date)
  })

  test("identifiers that merely look numeric stay text", () => {
    assert.equal(coerceInput("007"), "007")
    assert.equal(coerceInput("00501"), "00501")
    // Beyond IEEE-754 integer precision: keep the digits the user typed.
    assert.equal(coerceInput("12345678901234567890"), "12345678901234567890")
    // Excel's explicit text prefix.
    assert.equal(coerceInput("'42"), "42")
  })

  test("a formula cell opens for editing as its formula", () => {
    assert.equal(formatCellEdit({ formula: "SUM(A1:A2)", result: 5 }), "=SUM(A1:A2)")
    assert.equal(formatCellDisplay({ formula: "SUM(A1:A2)", result: 5 }), "5")
    // A cached result of 0 renders as "0", not as the formula.
    assert.equal(formatCellDisplay({ formula: "A1*0", result: 0 }), "0")
  })

  test("dates render as YYYY-MM-DD regardless of the local timezone", () => {
    assert.equal(formatCellDisplay(D("2026-01-15T00:00:00Z")), "2026-01-15")
    assert.equal(
      formatCellDisplay(D("2026-01-15T13:45:00Z")),
      "2026-01-15 13:45:00",
    )
  })

  test("round-trips a date through display and back", () => {
    const original = D("2026-01-15T00:00:00Z")
    const restored = coerceInput(formatCellDisplay(original))
    assert.ok(restored instanceof Date)
    assert.equal((restored as Date).getTime(), original.getTime())
  })

  test("toNumber understands booleans, numeric text and formula results", () => {
    assert.equal(toNumber(true), 1)
    assert.equal(toNumber("  12.5 "), 12.5)
    assert.equal(toNumber({ formula: "X", result: 9 }), 9)
    assert.equal(toNumber("not a number"), null)
    assert.equal(toNumber(null), null)
  })

  test("compareValues orders mixed types deterministically", () => {
    assert.ok(compareValues(1, 2) < 0)
    assert.ok(compareValues("b", "a") > 0)
    assert.ok(compareValues(null, 1) > 0, "blanks last")
    assert.equal(compareValues(null, null), 0)
  })
})

describe("colour sanitising", () => {
  test("rejects a crafted fill that would break out of the style attribute", () => {
    // Verbatim payload recovered from a hand-built .xlsx.
    assert.equal(sanitizeHexColor('#red"><img src=x onerror=alert(1)>'), undefined)
    assert.equal(sanitizeHexColor("red"), undefined)
    assert.equal(sanitizeHexColor("javascript:alert(1)"), undefined)
    assert.equal(sanitizeHexColor("#12345"), undefined)
    assert.equal(sanitizeHexColor(null), undefined)
  })

  test("accepts and normalises valid hex", () => {
    assert.equal(sanitizeHexColor("#FFFF00"), "#ffff00")
    assert.equal(sanitizeHexColor("#fff"), "#fff")
  })

  test("argb parsing rejects anything non-hex", () => {
    assert.equal(argbToHex('00red"><img src=x>'), undefined)
    assert.equal(argbToHex("FFFFFF00"), "#ffff00")
    assert.equal(argbToHex(undefined), undefined)
  })

  test("hex to argb survives a round trip", () => {
    assert.equal(hexToArgb("#ffff00"), "FFFFFF00")
    assert.equal(hexToArgb("#fff"), "FFFFFFFF")
    assert.equal(hexToArgb("bogus"), undefined)
  })
})

describe("find and replace", () => {
  const searchRows: CellValue[][] = [
    ["alpha", "Beta", 10],
    ["gamma", "beta", 20],
    ["ALPHA", null, { formula: "A1*2", result: 84 }],
  ]

  test("finds case-insensitively by default", () => {
    const { matches } = findMatches(searchRows, { query: "alpha" })
    assert.deepEqual(matches, [
      { row: 0, col: 0 },
      { row: 2, col: 0 },
    ])
  })

  test("respects match case", () => {
    const { matches } = findMatches(searchRows, { query: "alpha", matchCase: true })
    assert.deepEqual(matches, [{ row: 0, col: 0 }])
  })

  test("whole-cell matching excludes substrings", () => {
    assert.equal(findMatches(searchRows, { query: "bet" }).matches.length, 2)
    assert.equal(
      findMatches(searchRows, { query: "bet", wholeCell: true }).matches.length,
      0,
    )
    assert.equal(
      findMatches(searchRows, { query: "beta", wholeCell: true }).matches.length,
      2,
    )
  })

  test("searches numbers by their displayed text", () => {
    assert.deepEqual(findMatches(searchRows, { query: "20" }).matches, [
      { row: 1, col: 2 },
    ])
  })

  test("searches formulas by their expression, not the cached result", () => {
    assert.deepEqual(findMatches(searchRows, { query: "A1*2" }).matches, [
      { row: 2, col: 2 },
    ])
    // 84 is the cached result and is not what the cell "says" when edited.
    assert.equal(findMatches(searchRows, { query: "84" }).matches.length, 0)
  })

  test("an empty query matches nothing", () => {
    assert.deepEqual(findMatches(searchRows, { query: "" }).matches, [])
  })

  test("replaces every occurrence within a cell", () => {
    assert.equal(replaceInCell("a-a-a", { query: "a" }, "b"), "b-b-b")
  })

  test("replacement is literal, not a regex or a $-pattern", () => {
    assert.equal(replaceInCell("a.c", { query: "." }, "X"), "aXc")
    assert.equal(replaceInCell("price", { query: "price" }, "$&!"), "$&!")
  })

  test("whole-cell replace swaps the entire value", () => {
    assert.equal(
      replaceInCell("beta test", { query: "beta test", wholeCell: true }, "x"),
      "x",
    )
  })

  test("returns null when the cell does not match", () => {
    assert.equal(replaceInCell("alpha", { query: "zzz" }, "x"), null)
  })

  test("replacing inside a formula keeps it a formula after coercion", () => {
    const replaced = replaceInCell({ formula: "A1*2" }, { query: "A1" }, "B7")
    assert.equal(replaced, "=B7*2")
    assert.deepEqual(coerceInput(replaced!), { formula: "B7*2" })
  })

  test("caps runaway result sets", () => {
    const many: CellValue[][] = Array.from({ length: MATCH_LIMIT + 50 }, () => ["x"])
    const { matches, truncated } = findMatches(many, { query: "x" })
    assert.equal(matches.length, MATCH_LIMIT)
    assert.equal(truncated, true)
  })
})

describe("style helpers", () => {
  test("isEmptyStyle recognises styles worth dropping", () => {
    assert.equal(isEmptyStyle(undefined), true)
    assert.equal(isEmptyStyle({}), true)
    assert.equal(isEmptyStyle({ bold: false }), true)
    assert.equal(isEmptyStyle({ bold: true }), false)
    assert.equal(isEmptyStyle({ align: "center" }), false)
    assert.equal(isEmptyStyle({ italic: true }), false)
  })
})
