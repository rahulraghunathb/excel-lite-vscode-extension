import * as path from "path"
import * as vscode from "vscode"

import { ExcelDocument, DocumentEdit, emptyEdit } from "./ExcelDocument"
import { StructuralKind } from "./structural"
import { SearchOptions, findMatches, replaceInCell } from "./search"
import {
  ColumnFilter,
  SelectionRange,
  SortState,
  computeAggregates,
  cycleSort,
  getColumnColors,
  getColumnValues,
  getProcessedRows,
} from "./grid"
import {
  CellStyle,
  CellValue,
  coerceInput,
  formatCellDisplay,
  formatCellEdit,
  getColumnLetter,
  isEmptyStyle,
  sanitizeHexColor,
} from "./model"
import { getHtmlShell } from "./webview"

interface WebviewMessage {
  type: string
  payload?: any
}

/** Rows sent to the webview per request. */
const WINDOW_LIMIT = 400

/**
 * Drives one webview for one document.
 *
 * The panel owns only view state (sort, filters, selection); all data lives in
 * the ExcelDocument, so several tabs never fight over a single static instance
 * the way the old `currentPanel` singleton did.
 */
export class ExcelPanel {
  private readonly _disposables: vscode.Disposable[] = []

  private _sort: SortState | null = null
  private _filters = new Map<number, ColumnFilter>()
  private _selection: SelectionRange[] = []
  private _isAutoSaveEnabled = false
  private _disposed = false

  /** Bumped whenever the visible row set changes, so stale windows are ignored. */
  private _rowVersion = 0
  /** Last window the webview asked for, re-served whenever the data changes. */
  private _lastWindow: { start: number; count: number } | null = null
  private _processedCache: {
    version: number
    rows: CellValue[][]
    originalIndices: number[]
  } | null = null

  constructor(
    private readonly _document: ExcelDocument,
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
  ) {
    this._panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(_extensionUri, "dist")],
    }

    // Attached before the HTML is set so the webview's "ready" cannot be missed.
    this._panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => void this._handleMessage(message),
      null,
      this._disposables,
    )

    this._document.onDidChangeContent(
      () => this._invalidateAndRefresh(),
      null,
      this._disposables,
    )

    this._document.onDidRevert(
      () => {
        this._filters.clear()
        this._sort = null
        this._selection = []
      },
      null,
      this._disposables,
    )

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

    this._panel.webview.html = getHtmlShell(this._panel.webview, this._extensionUri)
  }

  // ------------------------------------------------------------------ plumbing

  private get _sheetIndex(): number {
    return this._document.model.sheetIndex
  }

  private get _allRows(): CellValue[][] {
    return this._document.activeSheet?.rows ?? []
  }

  private _styleLookup = (row: number, col: number): CellStyle | undefined =>
    this._document.getStyle(this._sheetIndex, row, col)

  private _processed() {
    if (this._processedCache?.version === this._rowVersion) {
      return this._processedCache
    }
    const result = getProcessedRows(
      this._allRows,
      this._filters,
      this._sort,
      this._styleLookup,
    )
    this._processedCache = { version: this._rowVersion, ...result }
    return this._processedCache
  }

  private _invalidateAndRefresh() {
    this._rowVersion++
    this._processedCache = null
    this._postInit()
    // Push the refreshed rows straight away rather than waiting for the
    // webview to notice the new version and ask again.
    if (this._lastWindow) {
      this._postWindow(this._lastWindow.start, this._lastWindow.count)
    }
    this._postAggregates()
    this._postActiveCell()
  }

  private _post(type: string, payload?: unknown) {
    if (this._disposed) return
    void this._panel.webview.postMessage({ type, payload })
  }

  // ------------------------------------------------------------------ outgoing

  private _postInit() {
    const model = this._document.model
    const { rows } = this._processed()

    const activeFilters: number[] = []
    this._filters.forEach((_, col) => activeFilters.push(col))

    this._post("init", {
      headers: model.headers,
      totalRows: rows.length,
      unfilteredRows: this._allRows.length,
      rowVersion: this._rowVersion,
      sheets: model.sheets.map((sheet, index) => ({ name: sheet.name, index })),
      sheetIndex: model.sheetIndex,
      sheetName: model.sheetName,
      fileName: path.basename(model.filePath),
      isAutoSaveEnabled: this._isAutoSaveEnabled,
      sort: this._sort,
      activeFilters,
      canEditStructure: this._filters.size === 0 && !this._sort,
    })
  }

  /** Serve one window of rows; the webview never holds the whole sheet. */
  private _postWindow(start: number, count: number) {
    this._lastWindow = { start, count }
    const { rows, originalIndices } = this._processed()
    const from = Math.max(0, Math.min(start, rows.length))
    const to = Math.min(rows.length, from + Math.min(count, WINDOW_LIMIT))

    const windowRows: string[][] = []
    const styles: Record<string, CellStyle> = {}

    for (let index = from; index < to; index++) {
      windowRows.push(rows[index].map((cell) => formatCellDisplay(cell)))
      const originalRow = originalIndices[index]
      for (let col = 0; col < rows[index].length; col++) {
        const style = this._styleLookup(originalRow, col)
        // Keyed by view row so the webview needs no index arithmetic.
        if (style) styles[`${index},${col}`] = style
      }
    }

    this._post("window", {
      start: from,
      rows: windowRows,
      styles,
      originalIndices: originalIndices.slice(from, to),
      rowVersion: this._rowVersion,
    })
  }

  private _postAggregates() {
    const { rows } = this._processed()
    this._post("aggregates", computeAggregates(rows, this._selection))
  }

  /** Feed the formula bar: the anchor cell's reference, text and formatting. */
  private _postActiveCell() {
    const anchor = this._selection[0]
    if (!anchor) {
      this._post("activeCell", null)
      return
    }

    const viewRow = Math.min(anchor.startRow, anchor.endRow)
    const col = Math.min(anchor.startCol, anchor.endCol)
    const originalRow = this._toOriginalRow(viewRow)
    if (originalRow === undefined) {
      this._post("activeCell", null)
      return
    }

    const value = this._document.getCell(this._sheetIndex, originalRow, col)
    this._post("activeCell", {
      row: viewRow,
      col,
      // Reference the underlying sheet row, so it matches what Excel shows.
      ref: `${getColumnLetter(col)}${originalRow + 2}`,
      text: formatCellEdit(value),
      style: this._styleLookup(originalRow, col) ?? null,
    })
  }

  // ------------------------------------------------------------------ incoming

  private async _handleMessage(message: WebviewMessage) {
    switch (message.type) {
      case "ready":
        this._postInit()
        break
      case "requestWindow":
        this._postWindow(
          Number(message.payload?.start) || 0,
          Number(message.payload?.count) || 100,
        )
        break
      case "selection":
        this._selection = Array.isArray(message.payload?.ranges)
          ? message.payload.ranges
          : []
        this._postAggregates()
        this._postActiveCell()
        break
      case "requestEditValue":
        this._sendEditValue(message.payload)
        break
      case "edit":
        this._handleCellEdit(message.payload)
        break
      case "sort":
        this._handleSort(message.payload)
        break
      case "filter":
        this._handleFilter(message.payload)
        break
      case "requestFilterOptions":
        this._sendFilterOptions(Number(message.payload?.column))
        break
      case "style":
        this._handleStyleChange(message.payload)
        break
      case "find":
        this._handleFind(message.payload)
        break
      case "replace":
        this._handleReplace(message.payload)
        break
      case "structural":
        this._handleStructural(message.payload)
        break
      case "switchSheet":
        this._handleSwitchSheet(message.payload?.index)
        break
      case "renameFile":
        await this._handleRenameFile()
        break
      case "renameSheet":
        await this._handleRenameSheet(message.payload?.index)
        break
      case "clipboard":
        await this._handleClipboard(message.payload)
        break
      case "undo":
        await vscode.commands.executeCommand("undo")
        break
      case "redo":
        await vscode.commands.executeCommand("redo")
        break
      case "save":
        await vscode.commands.executeCommand("workbench.action.files.save")
        break
      case "autoSaveToggle":
        this._isAutoSaveEnabled = !!message.payload
        break
      case "error":
        console.error("[Excel Lite] webview error", message.payload)
        break
    }
  }

  /** Resolve a view row to its index in the underlying sheet. */
  private _toOriginalRow(viewRow: number): number | undefined {
    return this._processed().originalIndices[viewRow]
  }

  private _sendEditValue(payload: { row: number; col: number }) {
    const originalRow = this._toOriginalRow(payload?.row)
    if (originalRow === undefined) return
    const value = this._document.getCell(this._sheetIndex, originalRow, payload.col)
    this._post("editValue", {
      row: payload.row,
      col: payload.col,
      text: formatCellEdit(value),
    })
  }

  private _handleCellEdit(payload: { row: number; col: number; value: string }) {
    const originalRow = this._toOriginalRow(payload?.row)
    if (originalRow === undefined) return

    const next = coerceInput(String(payload.value ?? ""))
    const before = this._document.getCell(this._sheetIndex, originalRow, payload.col)
    if (formatCellEdit(before) === formatCellEdit(next)) return

    const edit = emptyEdit("Edit cell")
    edit.cells.push({
      sheetIndex: this._sheetIndex,
      row: originalRow,
      col: payload.col,
      before,
      after: next,
    })
    this._commit(edit)
  }

  private _handleSort(payload: {
    column: number
    direction?: string
    byColor?: boolean
  }) {
    const column = Number(payload?.column)
    if (!Number.isInteger(column) || column < 0) return

    if (payload?.byColor) {
      this._sort = { column, direction: "asc", byColor: true }
    } else if (payload?.direction) {
      const direction = payload.direction
      this._sort =
        direction === "asc" || direction === "desc"
          ? { column, direction }
          : { column, direction: "none" }
    } else {
      this._sort = cycleSort(this._sort, column)
    }

    this._invalidateAndRefresh()
  }

  private _handleFilter(payload: { column: number; filter?: ColumnFilter }) {
    const column = Number(payload?.column)
    if (!Number.isInteger(column)) return

    if (!payload.filter) this._filters.delete(column)
    else this._filters.set(column, payload.filter)

    this._selection = []
    this._invalidateAndRefresh()
  }

  /**
   * Options for the filter popup, derived from every row in the column rather
   * than the visible ones so a filtered-out value can still be re-selected.
   */
  private _sendFilterOptions(column: number) {
    if (!Number.isInteger(column)) return
    this._post("filterOptions", {
      column,
      values: getColumnValues(this._allRows, column),
      colors: getColumnColors(this._allRows.length, column, this._styleLookup),
      current: this._filters.get(column) ?? null,
    })
  }

  private _handleStyleChange(payload: {
    type:
      | "bold"
      | "italic"
      | "underline"
      | "fill"
      | "fontColor"
      | "clearFill"
      | "clearFormat"
      | "align"
    color?: string
    align?: "left" | "center" | "right"
  }) {
    if (this._selection.length === 0) return

    const { originalIndices, rows } = this._processed()
    const LABELS: Record<string, string> = {
      bold: "Toggle bold",
      italic: "Toggle italic",
      underline: "Toggle underline",
      fill: "Change fill",
      fontColor: "Change text colour",
      clearFill: "Clear fill",
      clearFormat: "Clear formatting",
      align: "Change alignment",
    }
    const edit = emptyEdit(LABELS[payload.type] ?? "Change formatting")
    const seen = new Set<string>()

    // Toggles apply to the whole selection as a group: if any selected cell
    // lacks the attribute, every cell gains it. Otherwise every cell loses it.
    const toggles = ["bold", "italic", "underline"] as const
    type Toggle = (typeof toggles)[number]
    const isToggle = (toggles as readonly string[]).includes(payload.type)
    let enable = false
    if (isToggle) {
      const attribute = payload.type as Toggle
      enable = this._eachSelectedCell(rows, (viewRow, col) => {
        const originalRow = originalIndices[viewRow]
        return !this._styleLookup(originalRow, col)?.[attribute]
      })
    }

    const color =
      payload.type === "fill" || payload.type === "fontColor"
        ? sanitizeHexColor(payload.color)
        : undefined
    if ((payload.type === "fill" || payload.type === "fontColor") && !color) return

    // Clicking the active alignment button clears it, matching the toggles.
    let align = payload.align
    if (payload.type === "align" && align) {
      const allAligned = !this._eachSelectedCell(rows, (viewRow, col) => {
        const originalRow = originalIndices[viewRow]
        return this._styleLookup(originalRow, col)?.align !== align
      })
      if (allAligned) align = undefined
    }

    this._forEachSelectedCell(rows, (viewRow, col) => {
      const originalRow = originalIndices[viewRow]
      if (originalRow === undefined) return
      const key = `${originalRow},${col}`
      if (seen.has(key)) return
      seen.add(key)

      const before = this._styleLookup(originalRow, col)
      let after: CellStyle = { ...(before ?? {}) }

      switch (payload.type) {
        case "bold":
        case "italic":
        case "underline":
          after[payload.type as Toggle] = enable
          break
        case "fill":
          after.bgColor = color
          break
        case "fontColor":
          after.fontColor = color
          break
        case "clearFill":
          delete after.bgColor
          break
        case "align":
          if (align) after.align = align
          else delete after.align
          break
        case "clearFormat":
          after = {}
          break
      }

      if (!after.bold) delete after.bold
      if (!after.italic) delete after.italic
      if (!after.underline) delete after.underline

      edit.styles.push({
        sheetIndex: this._sheetIndex,
        row: originalRow,
        col,
        before: before ? { ...before } : undefined,
        after: isEmptyStyle(after) ? undefined : after,
      })
    })

    this._commit(edit)
  }

  private _forEachSelectedCell(
    rows: CellValue[][],
    visit: (viewRow: number, col: number) => void,
  ) {
    const width = this._document.model.headers.length
    for (const range of this._selection) {
      const startRow = Math.max(0, Math.min(range.startRow, range.endRow))
      const endRow = Math.min(rows.length - 1, Math.max(range.startRow, range.endRow))
      const startCol = Math.max(0, Math.min(range.startCol, range.endCol))
      const endCol = Math.min(width - 1, Math.max(range.startCol, range.endCol))
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) visit(row, col)
      }
    }
  }

  /** True when `predicate` holds for at least one selected cell. */
  private _eachSelectedCell(
    rows: CellValue[][],
    predicate: (viewRow: number, col: number) => boolean,
  ): boolean {
    let result = false
    this._forEachSelectedCell(rows, (row, col) => {
      if (!result && predicate(row, col)) result = true
    })
    return result
  }


  /**
   * Insert or delete rows/columns around the current selection.
   *
   * Row indices arrive in view coordinates. Sorting or filtering makes the view
   * order differ from the sheet order, so a structural change is only meaningful
   * against an unfiltered, unsorted view.
   */

  // -------------------------------------------------------------- find/replace

  private _searchOptions(payload: any): SearchOptions {
    return {
      query: String(payload?.query ?? ""),
      matchCase: !!payload?.matchCase,
      wholeCell: !!payload?.wholeCell,
    }
  }

  /** Search the visible rows, so filtered-out cells are never navigated to. */
  private _handleFind(payload: any) {
    const options = this._searchOptions(payload)
    const { rows } = this._processed()
    const { matches, truncated } = findMatches(rows, options)
    this._post("findResults", { matches, truncated, query: options.query })
  }

  private _handleReplace(payload: any) {
    const options = this._searchOptions(payload)
    if (options.query === "") return

    const replacement = String(payload?.replacement ?? "")
    const all = !!payload?.all
    const { rows, originalIndices } = this._processed()

    const targets: { row: number; col: number }[] = all
      ? findMatches(rows, options).matches
      : Number.isInteger(payload?.row) && Number.isInteger(payload?.col)
        ? [{ row: payload.row, col: payload.col }]
        : []

    const edit = emptyEdit(all ? "Replace all" : "Replace")
    for (const target of targets) {
      const originalRow = originalIndices[target.row]
      if (originalRow === undefined) continue

      const before = this._document.getCell(this._sheetIndex, originalRow, target.col)
      const text = replaceInCell(before, options, replacement)
      if (text === null) continue

      const after = coerceInput(text)
      if (formatCellEdit(before) === formatCellEdit(after)) continue
      edit.cells.push({
        sheetIndex: this._sheetIndex,
        row: originalRow,
        col: target.col,
        before,
        after,
      })
    }

    if (edit.cells.length === 0) {
      this._post("replaceDone", { replaced: 0 })
      return
    }

    this._commit(edit)
    this._post("replaceDone", { replaced: edit.cells.length })
  }

  private _handleStructural(payload: {
    kind: StructuralKind
    at?: number
    count?: number
  }) {
    const kind = payload?.kind
    if (
      kind !== "insertRows" &&
      kind !== "deleteRows" &&
      kind !== "insertCols" &&
      kind !== "deleteCols"
    ) {
      return
    }

    const isRowOp = kind === "insertRows" || kind === "deleteRows"

    if (isRowOp && (this._filters.size > 0 || this._sort)) {
      vscode.window.showWarningMessage(
        "Clear the sort and filters before inserting or deleting rows.",
      )
      return
    }

    const sheet = this._document.activeSheet
    if (!sheet) return

    const limit = isRowOp ? sheet.rows.length : sheet.headers.length
    const at = Math.max(0, Math.min(Number(payload.at) || 0, limit))
    const count = Math.max(1, Number(payload.count) || 1)

    if (kind === "deleteRows" || kind === "deleteCols") {
      if (at >= limit) return
      // Never leave a sheet with no columns at all.
      if (kind === "deleteCols" && count >= sheet.headers.length) {
        vscode.window.showWarningMessage("A sheet must keep at least one column.")
        return
      }
    }

    const edit = emptyEdit(
      {
        insertRows: "Insert rows",
        deleteRows: "Delete rows",
        insertCols: "Insert columns",
        deleteCols: "Delete columns",
      }[kind],
    )
    edit.structural.push({
      sheetIndex: this._sheetIndex,
      kind,
      at,
      count: Math.min(count, kind.startsWith("delete") ? limit - at : count),
    })

    this._selection = []
    this._commit(edit)
  }

  private _handleSwitchSheet(index?: number) {
    const model = this._document.model
    if (typeof index !== "number" || !model.sheets[index]) return
    if (index === model.sheetIndex) return

    const sheet = model.sheets[index]
    model.sheetIndex = index
    model.sheetName = sheet.name
    model.headers = sheet.headers
    model.rows = sheet.rows
    model.styles = sheet.styles

    this._filters.clear()
    this._sort = null
    this._selection = []
    this._invalidateAndRefresh()
  }

  private async _handleRenameFile() {
    const oldPath = this._document.model.filePath
    const oldBase = path.basename(oldPath)
    const ext = path.extname(oldPath)

    if (this._document.hasUnsavedChanges) {
      vscode.window.showWarningMessage(
        "Save your changes before renaming this file.",
      )
      return
    }

    const newName = await vscode.window.showInputBox({
      prompt: "Rename file",
      value: oldBase,
      validateInput: (value) => {
        if (!value || !value.trim()) return "File name cannot be empty"
        if (/[\\/:*?"<>|]/.test(value)) return "File name contains invalid characters"
        if (path.extname(value).toLowerCase() !== ext.toLowerCase()) {
          return `File extension must stay as ${ext}`
        }
        return null
      },
    })
    if (!newName || newName === oldBase) return

    const newUri = vscode.Uri.file(path.join(path.dirname(oldPath), newName))
    try {
      // workspace.fs.rename moves the open editor with the file.
      await vscode.workspace.fs.rename(this._document.uri, newUri, {
        overwrite: false,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      vscode.window.showErrorMessage(`Failed to rename file: ${msg}`)
    }
  }

  private async _handleRenameSheet(index?: number) {
    const model = this._document.model
    const sheetIndex = typeof index === "number" ? index : model.sheetIndex
    const sheet = model.sheets[sheetIndex]
    if (!sheet) return

    const newName = await vscode.window.showInputBox({
      prompt: "Rename sheet",
      value: sheet.name,
      validateInput: (value) => {
        const trimmed = value?.trim() ?? ""
        if (!trimmed) return "Sheet name cannot be empty"
        if (trimmed.length > 31) return "Sheet names are limited to 31 characters"
        if (/[\\/*?:[\]]/.test(trimmed)) {
          return "Sheet names cannot contain \\ / * ? : [ ]"
        }
        const clash = model.sheets.some(
          (other, i) => i !== sheetIndex && other.name === trimmed,
        )
        if (clash) return "Another sheet already has that name"
        return null
      },
    })
    if (!newName || newName === sheet.name) return

    const edit = emptyEdit("Rename sheet")
    edit.sheetNames.push({
      sheetIndex,
      before: sheet.name,
      after: newName.trim(),
    })
    this._commit(edit)
  }

  // ----------------------------------------------------------------- clipboard

  /** Parse Excel/Sheets clipboard TSV, honouring quoted multi-line cells. */
  private _parseClipboard(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let field = ""
    let inQuotes = false

    for (let i = 0; i < text.length; i++) {
      const char = text[i]

      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"'
            i++
          } else inQuotes = false
        } else field += char
        continue
      }

      if (char === '"' && field === "") inQuotes = true
      else if (char === "\t") {
        row.push(field)
        field = ""
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i++
        row.push(field)
        rows.push(row)
        row = []
        field = ""
      } else field += char
    }

    if (field !== "" || row.length > 0) {
      row.push(field)
      rows.push(row)
    }

    // A trailing newline produces one empty row; that is the terminator.
    if (rows.length > 1) {
      const last = rows[rows.length - 1]
      if (last.length === 1 && last[0] === "") rows.pop()
    }

    return rows
  }

  private async _handleClipboard(payload: {
    action: "copy" | "cut" | "paste" | "clear"
  }) {
    if (payload.action === "paste") {
      await this._paste()
      return
    }
    if (payload.action === "clear") {
      this._clearSelection()
      return
    }
    await this._copyOrCut(payload.action === "cut")
  }

  /** Blank every selected cell without touching the clipboard. */
  private _clearSelection() {
    if (this._selection.length === 0) return
    const { rows, originalIndices } = this._processed()
    const edit = emptyEdit("Clear cells")
    const seen = new Set<string>()

    this._forEachSelectedCell(rows, (viewRow, col) => {
      const originalRow = originalIndices[viewRow]
      if (originalRow === undefined) return
      const key = `${originalRow},${col}`
      if (seen.has(key)) return
      seen.add(key)

      const before = this._document.getCell(this._sheetIndex, originalRow, col)
      if (before === null) return
      edit.cells.push({
        sheetIndex: this._sheetIndex,
        row: originalRow,
        col,
        before,
        after: null,
      })
    })

    this._commit(edit)
  }

  private async _copyOrCut(isCut: boolean) {
    if (this._selection.length === 0) return
    const { rows, originalIndices } = this._processed()

    // Copy the bounding box of every selected range, so a multi-range
    // selection exports as one rectangle instead of only its first range.
    let minRow = Infinity
    let maxRow = -Infinity
    let minCol = Infinity
    let maxCol = -Infinity
    this._forEachSelectedCell(rows, (row, col) => {
      minRow = Math.min(minRow, row)
      maxRow = Math.max(maxRow, row)
      minCol = Math.min(minCol, col)
      maxCol = Math.max(maxCol, col)
    })
    if (!Number.isFinite(minRow)) return

    const selected = new Set<string>()
    this._forEachSelectedCell(rows, (row, col) => selected.add(`${row},${col}`))

    const lines: string[] = []
    const edit = emptyEdit("Cut")

    for (let row = minRow; row <= maxRow; row++) {
      const fields: string[] = []
      for (let col = minCol; col <= maxCol; col++) {
        const inSelection = selected.has(`${row},${col}`)
        const value = inSelection ? (rows[row]?.[col] ?? null) : null
        const text = formatCellDisplay(value)
        fields.push(
          /[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text,
        )

        if (isCut && inSelection) {
          const originalRow = originalIndices[row]
          if (originalRow === undefined) continue
          const before = this._document.getCell(this._sheetIndex, originalRow, col)
          if (before !== null) {
            edit.cells.push({
              sheetIndex: this._sheetIndex,
              row: originalRow,
              col,
              before,
              after: null,
            })
          }
        }
      }
      lines.push(fields.join("\t"))
    }

    await vscode.env.clipboard.writeText(lines.join("\n"))
    // History is recorded *after* reading the values but before they are
    // applied, so undo restores what was cut.
    if (isCut) this._commit(edit)
  }

  private async _paste() {
    if (this._selection.length === 0) return
    const text = await vscode.env.clipboard.readText()
    if (!text) return

    const source = this._parseClipboard(text)
    if (source.length === 0) return

    const anchor = this._selection[0]
    const startRow = Math.min(anchor.startRow, anchor.endRow)
    const startCol = Math.min(anchor.startCol, anchor.endCol)

    // A paste may extend the sheet rather than being truncated. Rows beyond the
    // current view can only be addressed when the view is the sheet itself, so
    // growth is limited to the unsorted, unfiltered case.
    const { originalIndices } = this._processed()
    const isIdentityView = this._filters.size === 0 && !this._sort
    const overflowsView = startRow + source.length > originalIndices.length

    const neededRows =
      overflowsView && isIdentityView
        ? Math.max(this._allRows.length, startRow + source.length)
        : this._allRows.length

    // reduce, not Math.max(...spread): a wide paste would exceed the argument
    // limit and throw.
    const widest = source.reduce((max, row) => Math.max(max, row.length), 0)
    const neededCols = Math.max(
      this._document.model.headers.length,
      startCol + widest,
    )
    this._document.ensureSize(this._sheetIndex, neededRows, neededCols)

    // ensureSize can add rows, which changes the processed view.
    this._rowVersion++
    this._processedCache = null
    const refreshed = this._processed()

    const edit = emptyEdit("Paste")
    for (let r = 0; r < source.length; r++) {
      const viewRow = startRow + r
      // Past the end of a filtered or sorted view there is no row to write to,
      // so the paste stops rather than landing somewhere arbitrary.
      const originalRow = refreshed.originalIndices[viewRow]
      if (originalRow === undefined) break

      for (let c = 0; c < source[r].length; c++) {
        const col = startCol + c
        if (col >= this._document.model.headers.length) break
        const before = this._document.getCell(this._sheetIndex, originalRow, col)
        const after = coerceInput(source[r][c])
        if (formatCellEdit(before) === formatCellEdit(after)) continue
        edit.cells.push({
          sheetIndex: this._sheetIndex,
          row: originalRow,
          col,
          before,
          after,
        })
      }
    }

    this._commit(edit)
  }

  // -------------------------------------------------------------------- commit

  private _commit(edit: DocumentEdit) {
    this._document.pushEdit(edit)
    if (this._isAutoSaveEnabled && this._document.hasUnsavedChanges) {
      void vscode.commands.executeCommand("workbench.action.files.save")
    }
  }

  public reveal(column?: vscode.ViewColumn) {
    this._panel.reveal(column)
  }

  public dispose() {
    if (this._disposed) return
    this._disposed = true
    while (this._disposables.length) this._disposables.pop()?.dispose()
  }
}
