/**
 * Shared cell value model.
 *
 * The extension host keeps *raw* cell values (numbers, Dates, booleans, formula
 * objects). The webview only ever receives display strings. Sorting, filtering
 * and aggregates all run in the host against the same display string the
 * webview shows, so the two sides can never disagree about what a cell "is".
 */

export interface FormulaValue {
  formula: string
  result?: string | number | boolean | Date | null
}

export interface HyperlinkValue {
  text: string
  hyperlink: string
}

export type CellValue =
  | string
  | number
  | boolean
  | Date
  | null
  | FormulaValue
  | HyperlinkValue

export type HorizontalAlign = "left" | "center" | "right"

/** Cell style information we round-trip through the UI. */
export interface CellStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  bgColor?: string
  fontColor?: string
  align?: HorizontalAlign
}

/** True when a style carries no formatting and can be dropped entirely. */
export function isEmptyStyle(style: CellStyle | undefined): boolean {
  if (!style) return true
  return (
    !style.bold &&
    !style.italic &&
    !style.underline &&
    !style.bgColor &&
    !style.fontColor &&
    !style.align
  )
}

export function isFormula(value: unknown): value is FormulaValue {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FormulaValue).formula === "string"
  )
}

export function isHyperlink(value: unknown): value is HyperlinkValue {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as HyperlinkValue).hyperlink === "string"
  )
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime())
}

/**
 * Only `#rgb` / `#rrggbb` / `#rrggbbaa` survive. Anything else is dropped.
 *
 * Colours originate in untrusted workbook bytes and are interpolated into a
 * `style="..."` attribute in the webview, so an unvalidated value is an HTML
 * injection vector. Reject rather than escape: a colour is never legitimately
 * anything but hex here.
 */
export function sanitizeHexColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
    return undefined
  }
  return trimmed.toLowerCase()
}

/** Expand `#abc` to `#aabbcc` so downstream ARGB conversion is uniform. */
export function normalizeHexColor(value: string): string {
  if (value.length === 4) {
    return (
      "#" + value[1] + value[1] + value[2] + value[2] + value[3] + value[3]
    )
  }
  return value
}

/** `#rrggbb` (or `#rrggbbaa`) -> ExcelJS `AARRGGBB`. */
export function hexToArgb(value: string): string | undefined {
  const safe = sanitizeHexColor(value)
  if (!safe) return undefined
  const hex = normalizeHexColor(safe).slice(1).toUpperCase()
  if (hex.length === 6) return "FF" + hex
  // #rrggbbaa -> AARRGGBB
  return hex.slice(6, 8) + hex.slice(0, 6)
}

/** ExcelJS `AARRGGBB` -> `#rrggbb`, rejecting anything malformed. */
export function argbToHex(argb: unknown): string | undefined {
  if (typeof argb !== "string") return undefined
  if (!/^[0-9a-fA-F]{8}$/.test(argb) && !/^[0-9a-fA-F]{6}$/.test(argb)) {
    return undefined
  }
  const rgb = argb.length === 8 ? argb.slice(2) : argb
  return sanitizeHexColor("#" + rgb)
}

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n)
}

/**
 * A date is displayed (and therefore filtered/copied) as `YYYY-MM-DD`, plus
 * `HH:MM:SS` when the time component is non-zero.
 *
 * Excel stores dates as UTC-midnight serials, so the UTC accessors are correct
 * here; using local getters shifts dates by a day in negative-offset zones.
 */
export function formatDate(value: Date): string {
  const y = value.getUTCFullYear()
  const m = pad(value.getUTCMonth() + 1)
  const d = pad(value.getUTCDate())
  const hh = value.getUTCHours()
  const mm = value.getUTCMinutes()
  const ss = value.getUTCSeconds()
  const datePart = `${y}-${m}-${d}`
  if (hh === 0 && mm === 0 && ss === 0) return datePart
  return `${datePart} ${pad(hh)}:${pad(mm)}:${pad(ss)}`
}

/**
 * The single source of truth for how a cell reads as text. Used for rendering,
 * filtering, aggregates and clipboard export.
 */
export function formatCellDisplay(value: CellValue): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
  if (isDate(value)) return formatDate(value)
  if (isFormula(value)) {
    // Show the cached result; fall back to the formula text when Excel never
    // stored one (otherwise the cell renders as "[object Object]").
    const result = value.result
    if (result === null || result === undefined) return "=" + value.formula
    return formatCellDisplay(result as CellValue)
  }
  if (isHyperlink(value)) return value.text ?? value.hyperlink
  return String(value)
}

/** The text shown when a cell is opened for editing (formulas show as `=...`). */
export function formatCellEdit(value: CellValue): string {
  if (isFormula(value)) return "=" + value.formula
  return formatCellDisplay(value)
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * Turn raw editor input into a typed cell value.
 *
 * Storing everything as a string is what breaks downstream formulas, so numbers,
 * dates, booleans and formulas are recovered here. Leading-zero strings
 * ("007", "00501") and anything quoted with a leading apostrophe stay text,
 * matching Excel's own behaviour.
 */
export function coerceInput(input: string): CellValue {
  if (input === "") return null

  if (input.startsWith("=") && input.length > 1) {
    return { formula: input.slice(1) }
  }

  // Excel's "force text" prefix.
  if (input.startsWith("'")) return input.slice(1)

  const trimmed = input.trim()
  if (trimmed === "") return input

  const upper = trimmed.toUpperCase()
  if (upper === "TRUE") return true
  if (upper === "FALSE") return false

  // Preserve identifiers that merely look numeric: leading zeros, a leading
  // "+", and anything too long to survive as an IEEE double.
  const numericLike = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(trimmed)
  if (numericLike) {
    const hasLeadingZero = /^-?0\d/.test(trimmed)
    if (!hasLeadingZero && trimmed.replace(/[-.]/g, "").length <= 15) {
      const num = Number(trimmed)
      if (Number.isFinite(num)) return num
    }
    return input
  }

  const dateOnly = DATE_ONLY.exec(trimmed)
  if (dateOnly) {
    const parsed = Date.UTC(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    )
    const date = new Date(parsed)
    if (!isNaN(date.getTime())) return date
  }

  const dateTime = DATE_TIME.exec(trimmed)
  if (dateTime) {
    const parsed = Date.UTC(
      Number(dateTime[1]),
      Number(dateTime[2]) - 1,
      Number(dateTime[3]),
      Number(dateTime[4]),
      Number(dateTime[5]),
      dateTime[6] ? Number(dateTime[6]) : 0,
    )
    const date = new Date(parsed)
    if (!isNaN(date.getTime())) return date
  }

  return input
}

/** Numeric view of a cell for SUM/AVG and numeric comparisons. */
export function toNumber(value: CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "boolean") return value ? 1 : 0
  if (isDate(value)) return value.getTime()
  if (isFormula(value)) return toNumber((value.result ?? null) as CellValue)
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed === "") return null
    const num = Number(trimmed)
    return Number.isFinite(num) ? num : null
  }
  return null
}

/** True when the cell holds no content at all (used for COUNT and blank rows). */
export function isBlank(value: CellValue): boolean {
  return formatCellDisplay(value).trim() === ""
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

/**
 * Type-aware ordering: numbers numerically, dates chronologically, everything
 * else via a natural-order collator. Blanks always sort last, as in Excel.
 */
export function compareValues(a: CellValue, b: CellValue): number {
  const aBlank = isBlank(a)
  const bBlank = isBlank(b)
  if (aBlank && bBlank) return 0
  if (aBlank) return 1
  if (bBlank) return -1

  const aResolved = isFormula(a) ? ((a.result ?? null) as CellValue) : a
  const bResolved = isFormula(b) ? ((b.result ?? null) as CellValue) : b

  if (isDate(aResolved) && isDate(bResolved)) {
    return aResolved.getTime() - bResolved.getTime()
  }

  const aNum = toNumber(aResolved)
  const bNum = toNumber(bResolved)
  if (aNum !== null && bNum !== null) return aNum - bNum
  if (aNum !== null) return -1
  if (bNum !== null) return 1

  return collator.compare(formatCellDisplay(a), formatCellDisplay(b))
}

/** Generate a column letter from a zero-based index (0 -> A, 26 -> AA). */
export function getColumnLetter(index: number): string {
  let result = ""
  let n = index
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}
