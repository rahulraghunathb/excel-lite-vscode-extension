import * as vscode from "vscode"
import * as path from "path"
import { TableModel, CellStyle } from "./fileParser"
import { getHtmlShell } from "./WebviewContent"

interface WebviewMessage {
  type: string
  payload?: any
}

/**
 * ExcelPanel handles the custom editor webview panel and its data/logic.
 */
export class ExcelPanel {
  public static currentPanel: ExcelPanel | undefined
  private readonly _panel: vscode.WebviewPanel
  private readonly _extensionUri: vscode.Uri
  private _tableModel: TableModel
  private _disposables: vscode.Disposable[] = []

  // State
  private _sortColumn: number = -1
  private _sortDirection: "asc" | "desc" | "none" = "none"
  private _filters: Map<
    number,
    { operator: string; value: string | string[] }
  > = new Map()
  private _styles: Map<string, CellStyle>
  private _selectedRanges: {
    startRow: number
    startCol: number
    endRow: number
    endCol: number
  }[] = []
  private _isAutoSaveEnabled: boolean = false
  private _clipboard: any[][] | null = null
  private _history: { rows: any[][]; styles: Map<string, CellStyle> }[] = []
  private _maxHistory = 50

  public static createOrShow(extensionUri: vscode.Uri, tableModel: TableModel) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined

    if (ExcelPanel.currentPanel) {
      ExcelPanel.currentPanel._panel.reveal(column)
      ExcelPanel.currentPanel.updateTableModel(tableModel)
      return ExcelPanel.currentPanel
    }

    const panel = vscode.window.createWebviewPanel(
      "excelLiteViewer",
      `Excel Lite: ${path.basename(tableModel.filePath)}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      },
    )

    ExcelPanel.currentPanel = new ExcelPanel(panel, extensionUri, tableModel)
    return ExcelPanel.currentPanel
  }

  constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    tableModel: TableModel,
  ) {
    this._panel = panel
    this._extensionUri = extensionUri
    this._tableModel = tableModel
    this._styles = new Map(tableModel.styles)

    // IMPORTANT: Attach message listener BEFORE setting HTML to avoid missing the 'ready' signal
    this._panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        void this._handleMessage(message)
      },
      null,
      this._disposables,
    )

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

    // Load static shell
    this._panel.webview.html = getHtmlShell()

    ExcelPanel.currentPanel = this
  }

  public updateTableModel(tableModel: TableModel) {
    this._tableModel = tableModel
    this._styles = new Map(tableModel.styles)
    this._panel.title = `Excel Lite: ${path.basename(tableModel.filePath)}`
    this._update()
  }

  private async _handleMessage(message: WebviewMessage) {
    console.log(`[Excel Lite] Received message: ${message.type}`)
    switch (message.type) {
      case "ready":
        this._update()
        break
      case "selection":
        if (Array.isArray(message.payload?.ranges)) {
          this._selectedRanges = message.payload.ranges
        } else if (message.payload) {
          this._selectedRanges = [message.payload]
        } else {
          this._selectedRanges = []
        }
        this._updateAggregates()
        break
      case "sort":
        this._handleSort(message.payload)
        break
      case "filter":
        this._handleFilter(message.payload)
        break
      case "style":
        this._handleStyleChange(message.payload)
        break
      case "undo":
        this._undo()
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
      case "edit":
        this._handleCellEdit(message.payload)
        break
      case "autoSaveToggle":
        this._isAutoSaveEnabled = message.payload
        break
      case "clipboard":
        await this._handleClipboard(message.payload)
        break
    }
  }

  private _handleSort(
    payload: number | { column: number; direction?: string },
  ) {
    const column = typeof payload === "number" ? payload : payload.column
    const direction =
      typeof payload === "number" ? undefined : payload.direction || undefined
    console.log(`[Excel Lite] Sorting column: ${column}`)
    if (direction) {
      this._sortColumn = column
      this._sortDirection =
        direction === "asc" || direction === "desc" ? direction : "none"
    } else if (this._sortColumn === column) {
      if (this._sortDirection === "none") this._sortDirection = "asc"
      else if (this._sortDirection === "asc") this._sortDirection = "desc"
      else this._sortDirection = "none"
    } else {
      this._sortColumn = column
      this._sortDirection = "asc"
    }
    this._update()
  }

  private _handleFilter(payload: {
    column: number
    operator: string
    value?: string | string[]
  }) {
    console.log(`[Excel Lite] Filtering column: ${payload.column}`)
    const isEmptyArray =
      Array.isArray(payload.value) && payload.value.length === 0
    const normalizedValue = Array.isArray(payload.value)
      ? payload.value
      : (payload.value ?? "")
    if (
      (normalizedValue === "" || isEmptyArray) &&
      payload.operator !== "clear"
    )
      this._filters.delete(payload.column)
    else if (payload.operator === "clear") this._filters.delete(payload.column)
    else
      this._filters.set(payload.column, {
        operator: payload.operator,
        value: normalizedValue,
      })
    this._update()
  }

  private _handleCellEdit(payload: {
    row: number
    col: number
    value: string
  }) {
    const { originalIndices } = this._getProcessedRows()
    const realRowIndex = originalIndices[payload.row]
    if (realRowIndex !== undefined) {
      this._pushHistory()
      this._tableModel.rows[realRowIndex][payload.col] = payload.value
      this._commitActiveSheet()
      this._triggerAutoSave()
      this._update()
    }
  }

  private _handleStyleChange(payload: {
    type: "bold" | "highlight" | "fill" | "clearFill"
    color?: string
  }) {
    if (this._selectedRanges.length === 0) return
    this._pushHistory()
    const { originalIndices } = this._getProcessedRows()

    this._selectedRanges.forEach((range) => {
      for (let row = range.startRow; row <= range.endRow; row++) {
        const realRow = originalIndices[row]
        if (realRow === undefined) continue
        for (let col = range.startCol; col <= range.endCol; col++) {
          const key = `${realRow},${col}`
          const existing = this._styles.get(key) || {}
          if (payload.type === "bold") existing.bold = !existing.bold
          else if (payload.type === "clearFill") delete existing.bgColor
          else if (
            (payload.type === "highlight" || payload.type === "fill") &&
            payload.color
          )
            existing.bgColor = payload.color
          this._styles.set(key, existing)
        }
      }
    })
    this._triggerAutoSave()
    this._update()
  }

  private async _handleRenameFile() {
    const oldPath = this._tableModel.filePath
    const oldBase = path.basename(oldPath)
    const ext = path.extname(oldPath)
    const newName = await vscode.window.showInputBox({
      prompt: "Rename file",
      value: oldBase,
      validateInput: (value) => {
        if (!value || !value.trim()) return "File name cannot be empty"
        if (path.extname(value) !== ext)
          return `File extension must stay as ${ext}`
        return null
      },
    })
    if (!newName || newName === oldBase) return

    const newPath = path.join(path.dirname(oldPath), newName)
    try {
      await vscode.workspace.fs.rename(
        vscode.Uri.file(oldPath),
        vscode.Uri.file(newPath),
        { overwrite: false },
      )
      this._tableModel.filePath = newPath
      this._panel.title = `Excel Lite: ${path.basename(newPath)}`
      this._update()
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      vscode.window.showErrorMessage(`Failed to rename file: ${msg}`)
    }
  }

  private async _handleRenameSheet(index?: number) {
    const sheetIndex =
      typeof index === "number" ? index : this._tableModel.sheetIndex
    const currentName =
      this._tableModel.sheets[sheetIndex]?.name || this._tableModel.sheetName
    const newName = await vscode.window.showInputBox({
      prompt: "Rename sheet",
      value: currentName,
      validateInput: (value) => {
        if (!value || !value.trim()) return "Sheet name cannot be empty"
        return null
      },
    })
    if (!newName || newName === currentName) return
    const sheet = this._tableModel.sheets[sheetIndex]
    if (sheet) sheet.name = newName
    if (sheetIndex === this._tableModel.sheetIndex) {
      this._tableModel.sheetName = newName
    }
    this._update()
    this._triggerAutoSave()
  }

  private async _handleClipboard(payload: {
    action: "copy" | "cut" | "paste"
  }) {
    if (this._selectedRanges.length === 0) return
    const { rows, originalIndices } = this._getProcessedRows()
    const selection = this._selectedRanges[0]

    if (payload.action === "copy" || payload.action === "cut") {
      const data: any[][] = []
      for (let r = selection.startRow; r <= selection.endRow; r++) {
        const rowData: any[] = []
        for (let c = selection.startCol; c <= selection.endCol; c++) {
          rowData.push(rows[r][c])
          if (payload.action === "cut") {
            const realRow = originalIndices[r]
            this._tableModel.rows[realRow][c] = ""
          }
        }
        data.push(rowData)
      }
      this._clipboard = data
      const plainText = data
        .map((row) => row.map((cell) => String(cell ?? "")).join("\t"))
        .join("\n")
      await vscode.env.clipboard.writeText(plainText)
      if (payload.action === "cut") {
        this._pushHistory()
        this._triggerAutoSave()
        this._update()
      }
    } else if (payload.action === "paste" && this._clipboard) {
      const startRow = selection.startRow
      const startCol = selection.startCol
      const clipboardText = await vscode.env.clipboard.readText()
      const parsed = clipboardText
        ? clipboardText
            .split(/\r?\n/)
            .filter(
              (line, idx, arr) => !(line === "" && idx === arr.length - 1),
            )
            .map((line) => line.split("\t"))
        : null
      const source = parsed && parsed.length > 0 ? parsed : this._clipboard
      if (!source) return

      this._pushHistory()
      for (let r = 0; r < source.length; r++) {
        const targetRow = startRow + r
        if (targetRow >= rows.length) break
        const realRow = originalIndices[targetRow]

        for (let c = 0; c < source[r].length; c++) {
          const targetCol = startCol + c
          if (targetCol >= this._tableModel.headers.length) break
          this._tableModel.rows[realRow][targetCol] = source[r][c]
        }
      }
      this._commitActiveSheet()
      this._triggerAutoSave()
      this._update()
    }
  }

  private _handleSwitchSheet(index?: number) {
    if (typeof index !== "number") return
    if (!this._tableModel.sheets[index]) return
    this._commitActiveSheet()
    const sheet = this._tableModel.sheets[index]
    this._tableModel.sheetIndex = index
    this._tableModel.sheetName = sheet.name
    this._tableModel.headers = sheet.headers
    this._tableModel.rows = sheet.rows
    this._styles = new Map(sheet.styles)
    this._filters = new Map()
    this._sortColumn = -1
    this._sortDirection = "none"
    this._selectedRanges = []
    this._update()
  }

  private _pushHistory() {
    const snapshot = {
      rows: JSON.parse(JSON.stringify(this._tableModel.rows)) as any[][],
      styles: new Map(
        Array.from(this._styles.entries()).map(([key, value]) => [
          key,
          { ...value },
        ]),
      ),
    }
    this._history.push(snapshot)
    if (this._history.length > this._maxHistory) {
      this._history.shift()
    }
  }

  private _undo() {
    const snapshot = this._history.pop()
    if (!snapshot) return
    this._tableModel.rows = snapshot.rows
    this._styles = snapshot.styles
    this._commitActiveSheet()
    this._update()
  }

  private _commitActiveSheet() {
    const sheet = this._tableModel.sheets[this._tableModel.sheetIndex]
    if (!sheet) return
    sheet.headers = this._tableModel.headers
    sheet.rows = this._tableModel.rows
    sheet.styles = new Map(this._styles)
    sheet.name = this._tableModel.sheetName
  }

  private _triggerAutoSave() {
    if (this._isAutoSaveEnabled) {
      vscode.commands.executeCommand(
        "excel-lite.internalSave",
        this._tableModel,
        this._styles,
      )
    }
  }

  /**
   * Applies filters and sorting to the table model, returning the processed view.
   */
  private _getProcessedRows(): { rows: any[][]; originalIndices: number[] } {
    let rows = [
      ...this._tableModel.rows.map((row, idx) => ({
        data: row,
        originalIndex: idx,
      })),
    ]
    this._filters.forEach((filter, colIndex) => {
      rows = rows.filter((row) => {
        const cellValue = String(row.data[colIndex] || "").toLowerCase()
        const filterValue =
          typeof filter.value === "string" ? filter.value.toLowerCase() : ""
        const filterValues = Array.isArray(filter.value)
          ? filter.value.map((val) => String(val).toLowerCase())
          : []
        switch (filter.operator) {
          case "contains":
            return cellValue.includes(filterValue)
          case "equals":
            return cellValue === filterValue
          case "notEquals":
            return cellValue !== filterValue
          case "in":
            return filterValues.includes(cellValue)
          case "startsWith":
            return cellValue.startsWith(filterValue)
          case "endsWith":
            return cellValue.endsWith(filterValue)
          case ">":
            return parseFloat(cellValue) > parseFloat(filterValue)
          case "<":
            return parseFloat(cellValue) < parseFloat(filterValue)
          default:
            return true
        }
      })
    })
    if (this._sortColumn >= 0 && this._sortDirection !== "none") {
      rows.sort((a, b) => {
        const aVal = a.data[this._sortColumn]
        const bVal = b.data[this._sortColumn]
        const aNum = parseFloat(aVal)
        const bNum = parseFloat(bVal)
        if (!isNaN(aNum) && !isNaN(bNum))
          return this._sortDirection === "asc" ? aNum - bNum : bNum - aNum
        const aStr = String(aVal || "")
        const bStr = String(bVal || "")
        return this._sortDirection === "asc"
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr)
      })
    }
    return {
      rows: rows.map((r) => r.data),
      originalIndices: rows.map((r) => r.originalIndex),
    }
  }

  private _updateAggregates() {
    if (this._selectedRanges.length === 0) return
    const { rows } = this._getProcessedRows()
    const values: number[] = []
    let count = 0
    this._selectedRanges.forEach((range) => {
      for (let row = range.startRow; row <= range.endRow; row++) {
        if (row >= rows.length) continue
        for (let col = range.startCol; col <= range.endCol; col++) {
          const raw = rows[row][col]
          const text = String(raw ?? "").trim()
          if (text !== "") count++
          const val = parseFloat(text)
          if (!isNaN(val)) values.push(val)
        }
      }
    })
    if (count > 0) {
      const sum = values.reduce((a, b) => a + b, 0)
      this._panel.webview.postMessage({
        type: "aggregates",
        payload: {
          sum: sum.toFixed(2),
          count,
          avg: values.length ? (sum / values.length).toFixed(2) : "0.00",
          showStats: values.length > 0,
        },
      })
    } else {
      this._panel.webview.postMessage({ type: "aggregates", payload: null })
    }
  }

  /**
   * Sends the latest data and state to the webview.
   */
  private _update() {
    this._commitActiveSheet()
    const { rows, originalIndices } = this._getProcessedRows()
    const stylesForWebview: Record<string, CellStyle> = {}
    this._styles.forEach((style, key) => {
      stylesForWebview[key] = style
    })

    this._panel.webview.postMessage({
      type: "update",
      payload: {
        rows,
        headers: this._tableModel.headers,
        originalIndices,
        styles: stylesForWebview,
        sheetName: this._tableModel.sheetName,
        sheetIndex: this._tableModel.sheetIndex,
        sheets: this._tableModel.sheets.map((sheet, index) => ({
          name: sheet.name,
          index,
        })),
        isAutoSaveEnabled: this._isAutoSaveEnabled,
      },
    })
  }

  public getStyles(): Map<string, CellStyle> {
    return this._styles
  }
  public getTableModel(): TableModel {
    return this._tableModel
  }

  public dispose() {
    if (ExcelPanel.currentPanel === this) ExcelPanel.currentPanel = undefined
    this._panel.dispose()
    while (this._disposables.length) {
      const x = this._disposables.pop()
      if (x) x.dispose()
    }
  }
}
