import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"

import { SheetModel, TableModel, parseFile } from "./fileParser"
import { CellStyle, CellValue, getColumnLetter, isEmptyStyle } from "./model"
import { DirtyState, dirtyKey, emptyDirtyState, writeFile } from "./fileWriter"
import {
  StructuralOp,
  applyStructural,
  invertStructural,
  restoreRemoved,
  shiftDirtyKeys,
} from "./structural"

export interface CellPatch {
  sheetIndex: number
  row: number
  col: number
  before: CellValue
  after: CellValue
}

export interface StylePatch {
  sheetIndex: number
  row: number
  col: number
  before?: CellStyle
  after?: CellStyle
}

export interface SheetNamePatch {
  sheetIndex: number
  before: string
  after: string
}

/**
 * One undoable change.
 *
 * Stored as before/after patches rather than whole-table snapshots: undo used
 * to deep-clone every row 50 times over, which is gigabytes on a large sheet.
 */
export interface DocumentEdit {
  label: string
  cells: CellPatch[]
  styles: StylePatch[]
  sheetNames: SheetNamePatch[]
  /** Row/column insertions and removals, applied before the cell patches. */
  structural: StructuralOp[]
}

export function emptyEdit(label: string): DocumentEdit {
  return { label, cells: [], styles: [], sheetNames: [], structural: [] }
}

export function isEmptyEdit(edit: DocumentEdit): boolean {
  return (
    edit.cells.length === 0 &&
    edit.styles.length === 0 &&
    edit.sheetNames.length === 0 &&
    edit.structural.length === 0
  )
}

/**
 * Backing document for the custom editor.
 *
 * Owns the parsed model, tracks precisely which cells changed so saves can
 * patch the original file, and exposes edits to VS Code so the tab shows a
 * dirty indicator and Ctrl+S / Ctrl+Z / hot exit all behave natively.
 */
export class ExcelDocument implements vscode.CustomDocument {
  private readonly _onDidChangeContent = new vscode.EventEmitter<void>()
  /** Fired when the model changed and the webview should re-render. */
  public readonly onDidChangeContent = this._onDidChangeContent.event

  private readonly _onDidChangeDocument =
    new vscode.EventEmitter<vscode.CustomDocumentEditEvent<ExcelDocument>>()
  public readonly onDidChangeDocument = this._onDidChangeDocument.event

  private readonly _onDidRevert = new vscode.EventEmitter<void>()
  public readonly onDidRevert = this._onDidRevert.event

  private _dirty: DirtyState = emptyDirtyState()
  /** Structural changes still to be replayed onto the file on the next save. */
  private _structuralLog: StructuralOp[] = []
  private _disposables: vscode.Disposable[] = []
  private _watcher: vscode.FileSystemWatcher | undefined
  private _savingUntil = 0

  private constructor(
    public readonly uri: vscode.Uri,
    private _model: TableModel,
    /** File the next Excel save patches; the backup file after a hot-exit restore. */
    private _patchSource: string,
  ) {
    this._registerWatcher()
  }

  public static async create(
    uri: vscode.Uri,
    backupId: string | undefined,
  ): Promise<ExcelDocument> {
    // A backup is a complete file containing the unsaved edits, so restoring is
    // just parsing it while keeping the real path for display and saving.
    const readFrom = backupId ?? uri.fsPath
    const model = await parseFile(readFrom)
    model.filePath = uri.fsPath
    return new ExcelDocument(uri, model, readFrom)
  }

  public get model(): TableModel {
    return this._model
  }

  public get dirtyState(): DirtyState {
    return this._dirty
  }

  public get hasUnsavedChanges(): boolean {
    return (
      this._dirty.cells.size > 0 ||
      this._dirty.styles.size > 0 ||
      this._dirty.sheetNames ||
      this._structuralLog.length > 0
    )
  }

  public get structuralLog(): readonly StructuralOp[] {
    return this._structuralLog
  }

  public get activeSheet(): SheetModel | undefined {
    return this._model.sheets[this._model.sheetIndex]
  }

  /** Reload from disk, discarding in-memory edits. */
  public async revert(): Promise<void> {
    const model = await parseFile(this.uri.fsPath)
    model.sheetIndex = Math.min(
      this._model.sheetIndex,
      Math.max(model.sheets.length - 1, 0),
    )
    const sheet = model.sheets[model.sheetIndex]
    if (sheet) {
      model.headers = sheet.headers
      model.rows = sheet.rows
      model.styles = sheet.styles
      model.sheetName = sheet.name
    }
    this._model = model
    this._patchSource = this.uri.fsPath
    this._dirty = emptyDirtyState()
    this._structuralLog = []
    this._onDidRevert.fire()
    this._onDidChangeContent.fire()
  }

  // ---------------------------------------------------------------- mutations

  public getCell(sheetIndex: number, row: number, col: number): CellValue {
    return this._model.sheets[sheetIndex]?.rows[row]?.[col] ?? null
  }

  public getStyle(
    sheetIndex: number,
    row: number,
    col: number,
  ): CellStyle | undefined {
    return this._model.sheets[sheetIndex]?.styles.get(`${row},${col}`)
  }

  /**
   * Grow a sheet so `row`/`col` exist. Pasting used to be clamped to the
   * current bounds and silently truncated.
   */
  public ensureSize(sheetIndex: number, rows: number, cols: number): void {
    const sheet = this._model.sheets[sheetIndex]
    if (!sheet) return

    while (sheet.headers.length < cols) {
      sheet.headers.push(getColumnLetter(sheet.headers.length))
    }

    const width = Math.max(sheet.headers.length, cols)
    while (sheet.rows.length < rows) {
      sheet.rows.push(new Array(width).fill(null))
    }
    sheet.rows.forEach((row) => {
      while (row.length < width) row.push(null)
    })

    if (sheetIndex === this._model.sheetIndex) {
      this._model.headers = sheet.headers
      this._model.rows = sheet.rows
    }
  }

  private _applyCell(patch: CellPatch, value: CellValue): void {
    const sheet = this._model.sheets[patch.sheetIndex]
    if (!sheet) return
    if (!sheet.rows[patch.row]) return
    sheet.rows[patch.row][patch.col] = value
    this._dirty.cells.add(dirtyKey(patch.sheetIndex, patch.row, patch.col))
  }

  private _applyStyle(patch: StylePatch, style: CellStyle | undefined): void {
    const sheet = this._model.sheets[patch.sheetIndex]
    if (!sheet) return
    const key = `${patch.row},${patch.col}`
    if (!isEmptyStyle(style)) sheet.styles.set(key, { ...style })
    else sheet.styles.delete(key)
    this._dirty.styles.add(dirtyKey(patch.sheetIndex, patch.row, patch.col))
    if (patch.sheetIndex === this._model.sheetIndex) {
      this._model.styles = sheet.styles
    }
  }

  private _applySheetName(patch: SheetNamePatch, name: string): void {
    const sheet = this._model.sheets[patch.sheetIndex]
    if (!sheet) return
    sheet.name = name
    this._dirty.sheetNames = true
    if (patch.sheetIndex === this._model.sheetIndex) {
      this._model.sheetName = name
    }
  }

  /**
   * Apply one structural operation and keep every outstanding coordinate valid.
   *
   * Style keys and dirty-cell keys shift by the same amount as the data, and
   * the operation is appended to the replay log so the save performs the
   * matching splice on the real worksheet.
   */
  private _applyStructural(op: StructuralOp): void {
    const sheet = this._model.sheets[op.sheetIndex]
    if (!sheet) return

    const target = {
      headers: sheet.headers,
      rows: sheet.rows,
      styles: sheet.styles,
    }
    const applied = applyStructural(target, op)
    sheet.styles = target.styles

    const axis =
      op.kind === "insertRows" || op.kind === "deleteRows" ? "row" : "col"
    const delta =
      op.kind === "insertRows" || op.kind === "insertCols" ? op.count : -op.count

    this._dirty.cells = shiftDirtyKeys(
      this._dirty.cells,
      op.sheetIndex,
      axis,
      op.at,
      delta,
    )
    this._dirty.styles = shiftDirtyKeys(
      this._dirty.styles,
      op.sheetIndex,
      axis,
      op.at,
      delta,
    )

    // Undoing a delete re-opens a blank band, so the restored values have to be
    // written back explicitly or the file keeps empty rows there.
    if (op.removedRows || op.removedHeaders || op.removedStyles) {
      const restored = restoreRemoved(target, op)
      for (const cell of restored.cells) {
        this._dirty.cells.add(dirtyKey(op.sheetIndex, cell.row, cell.col))
      }
      for (const cell of restored.styles) {
        this._dirty.styles.add(dirtyKey(op.sheetIndex, cell.row, cell.col))
      }
    }

    this._structuralLog.push({
      sheetIndex: op.sheetIndex,
      kind: op.kind,
      at: op.at,
      count: op.count,
    })

    // A delete only discovers what it removed when it runs, so hand that back
    // to the edit for the eventual undo.
    if (applied.removedRows) op.removedRows = applied.removedRows
    if (applied.removedHeaders) op.removedHeaders = applied.removedHeaders
    if (applied.removedStyles) op.removedStyles = applied.removedStyles

    this._syncActiveSheet()
  }

  /** Keep the model's convenience aliases pointing at the active sheet. */
  private _syncActiveSheet(): void {
    const sheet = this._model.sheets[this._model.sheetIndex]
    if (!sheet) return
    this._model.headers = sheet.headers
    this._model.rows = sheet.rows
    this._model.styles = sheet.styles
  }

  private _applyEdit(edit: DocumentEdit, direction: "redo" | "undo"): void {
    const useAfter = direction === "redo"

    // Redo lays out the structure first; undo unwinds it last, inverted.
    if (useAfter) {
      for (const op of edit.structural) this._applyStructural(op)
    }

    for (const patch of edit.cells) {
      this._applyCell(patch, useAfter ? patch.after : patch.before)
    }
    for (const patch of edit.styles) {
      this._applyStyle(patch, useAfter ? patch.after : patch.before)
    }
    for (const patch of edit.sheetNames) {
      this._applySheetName(patch, useAfter ? patch.after : patch.before)
    }

    if (!useAfter) {
      for (let i = edit.structural.length - 1; i >= 0; i--) {
        this._applyStructural(invertStructural(edit.structural[i]))
      }
    }

    this._onDidChangeContent.fire()
  }

  /**
   * Apply an edit and hand it to VS Code's undo stack.
   *
   * The edit is applied here exactly once; VS Code calls back into
   * `undo`/`redo` afterwards.
   */
  public pushEdit(edit: DocumentEdit): void {
    if (isEmptyEdit(edit)) return

    this._applyEdit(edit, "redo")

    this._onDidChangeDocument.fire({
      document: this,
      label: edit.label,
      undo: () => this._applyEdit(edit, "undo"),
      redo: () => this._applyEdit(edit, "redo"),
    })
  }

  // -------------------------------------------------------------------- saving

  /**
   * Refuse to clobber a file that changed underneath us.
   *
   * Returns true when it is safe to continue.
   */
  private async _checkForExternalChange(target: string): Promise<boolean> {
    if (target !== this.uri.fsPath) return true
    let current = 0
    try {
      current = fs.statSync(target).mtimeMs
    } catch {
      return true
    }
    // Tolerate sub-millisecond clock jitter between stat calls.
    if (Math.abs(current - this._model.mtimeMs) < 1) return true

    const overwrite = "Overwrite"
    const choice = await vscode.window.showWarningMessage(
      `${path.basename(target)} has changed on disk since it was opened. ` +
        `Overwriting will discard those external changes.`,
      { modal: true },
      overwrite,
    )
    return choice === overwrite
  }

  public async save(cancellation?: vscode.CancellationToken): Promise<void> {
    await this.saveAs(this.uri, cancellation)
  }

  public async saveAs(
    target: vscode.Uri,
    cancellation?: vscode.CancellationToken,
  ): Promise<void> {
    if (cancellation?.isCancellationRequested) return

    const isInPlace = target.fsPath === this.uri.fsPath
    if (isInPlace && !(await this._checkForExternalChange(target.fsPath))) {
      throw new vscode.CancellationError()
    }

    // Suppress the watcher event our own write is about to produce.
    this._savingUntil = Date.now() + 1500

    await writeFile(
      target.fsPath,
      this._model,
      this._dirty,
      this._patchSource,
      this._structuralLog,
    )

    if (isInPlace) {
      this._dirty = emptyDirtyState()
      this._structuralLog = []
      this._patchSource = target.fsPath
      try {
        this._model.mtimeMs = fs.statSync(target.fsPath).mtimeMs
      } catch {
        /* best effort */
      }
    }
  }

  public async backup(
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    await this.saveAs(destination, cancellation)
    return {
      id: destination.fsPath,
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(destination)
        } catch {
          /* already gone */
        }
      },
    }
  }

  // ------------------------------------------------------------------ watching

  private _registerWatcher(): void {
    this._watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.file(path.dirname(this.uri.fsPath)),
        path.basename(this.uri.fsPath),
      ),
    )

    this._watcher.onDidChange(
      () => void this._handleExternalChange(),
      null,
      this._disposables,
    )
    this._disposables.push(this._watcher)
  }

  /** Silently reload a clean document; warn instead when there are edits. */
  private async _handleExternalChange(): Promise<void> {
    if (Date.now() < this._savingUntil) return

    let current = 0
    try {
      current = fs.statSync(this.uri.fsPath).mtimeMs
    } catch {
      return
    }
    if (Math.abs(current - this._model.mtimeMs) < 1) return

    if (!this.hasUnsavedChanges) {
      try {
        await this.revert()
      } catch {
        /* the file may be mid-write; the next event will catch it */
      }
      return
    }

    const reload = "Reload from disk"
    const choice = await vscode.window.showWarningMessage(
      `${path.basename(this.uri.fsPath)} changed on disk but has unsaved changes here.`,
      reload,
      "Keep my version",
    )
    if (choice === reload) await this.revert()
    else this._model.mtimeMs = current
  }

  public dispose(): void {
    this._onDidChangeContent.dispose()
    this._onDidChangeDocument.dispose()
    this._onDidRevert.dispose()
    while (this._disposables.length) this._disposables.pop()?.dispose()
  }
}
