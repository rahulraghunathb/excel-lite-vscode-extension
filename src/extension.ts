import * as path from "path"
import * as vscode from "vscode"

import { ExcelDocument } from "./ExcelDocument"
import { ExcelPanel } from "./ExcelPanel"
import { UnsupportedLegacyXlsError } from "./fileParser"

const VIEW_TYPE = "excel-lite.viewer"
const SUPPORTED_EXTENSIONS = [".xlsx", ".xlsm", ".csv", ".tsv"]

/**
 * Editable custom editor for spreadsheets.
 *
 * Implementing the full `CustomEditorProvider` (rather than the read-only
 * variant) is what gives the tab a dirty indicator, working Ctrl+S, native
 * undo/redo and hot exit — previously edits vanished silently on close.
 */
class ExcelEditorProvider implements vscode.CustomEditorProvider<ExcelDocument> {
  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<ExcelDocument>
  >()
  public readonly onDidChangeCustomDocument =
    this._onDidChangeCustomDocument.event

  constructor(private readonly _context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      VIEW_TYPE,
      new ExcelEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: false },
        supportsMultipleEditorsPerDocument: false,
      },
    )
  }

  public async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<ExcelDocument> {
    const document = await ExcelDocument.create(uri, openContext.backupId)
    document.onDidChangeDocument((event) =>
      this._onDidChangeCustomDocument.fire(event),
    )
    return document
  }

  public async resolveCustomEditor(
    document: ExcelDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    new ExcelPanel(document, webviewPanel, this._context.extensionUri)
  }

  public saveCustomDocument(
    document: ExcelDocument,
    cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    return document.save(cancellation)
  }

  public saveCustomDocumentAs(
    document: ExcelDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    return document.saveAs(destination, cancellation)
  }

  public revertCustomDocument(document: ExcelDocument): Thenable<void> {
    return document.revert()
  }

  public backupCustomDocument(
    document: ExcelDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken,
  ): Thenable<vscode.CustomDocumentBackup> {
    return document.backup(context.destination, cancellation)
  }
}

function isSupported(uri: vscode.Uri): boolean {
  return SUPPORTED_EXTENSIONS.includes(path.extname(uri.fsPath).toLowerCase())
}

/** Best guess at the spreadsheet the user means right now. */
function activeSpreadsheetUri(): vscode.Uri | undefined {
  const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input
  if (
    activeTabInput instanceof vscode.TabInputCustom &&
    activeTabInput.viewType === VIEW_TYPE
  ) {
    return activeTabInput.uri
  }
  if (activeTabInput instanceof vscode.TabInputText) {
    return isSupported(activeTabInput.uri) ? activeTabInput.uri : undefined
  }
  const editor = vscode.window.activeTextEditor
  if (editor && isSupported(editor.document.uri)) return editor.document.uri
  return undefined
}

function reportOpenFailure(error: unknown, uri: vscode.Uri) {
  if (error instanceof UnsupportedLegacyXlsError) {
    vscode.window.showErrorMessage(error.message)
    return
  }
  const message = error instanceof Error ? error.message : "Unknown error"
  vscode.window.showErrorMessage(
    `Excel Lite could not open ${path.basename(uri.fsPath)}: ${message}`,
  )
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(ExcelEditorProvider.register(context))

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "excel-lite.openViewer",
      async (resource?: vscode.Uri) => {
        let uri = resource instanceof vscode.Uri ? resource : activeSpreadsheetUri()

        if (!uri) {
          const picked = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            filters: {
              Spreadsheets: ["xlsx", "xlsm", "csv", "tsv"],
              "All Files": ["*"],
            },
            title: "Select a spreadsheet",
          })
          uri = picked?.[0]
        }
        if (!uri) return

        if (path.extname(uri.fsPath).toLowerCase() === ".xls") {
          vscode.window.showErrorMessage(
            new UnsupportedLegacyXlsError(uri.fsPath).message,
          )
          return
        }

        try {
          // Route through the custom editor so every file gets a real document
          // with its own undo stack, dirty state and save target.
          await vscode.commands.executeCommand("vscode.openWith", uri, VIEW_TYPE)
        } catch (error) {
          reportOpenFailure(error, uri)
        }
      },
    ),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("excel-lite.saveChanges", async () => {
      const uri = activeSpreadsheetUri()
      if (!uri) {
        vscode.window.showWarningMessage("No spreadsheet is currently open")
        return
      }
      await vscode.commands.executeCommand("workbench.action.files.save")
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("excel-lite.saveAs", async () => {
      const uri = activeSpreadsheetUri()
      if (!uri) {
        vscode.window.showWarningMessage("No spreadsheet is currently open")
        return
      }
      await vscode.commands.executeCommand("workbench.action.files.saveAs")
    }),
  )
}

export function deactivate() {
  /* nothing to tear down: all resources are registered as subscriptions */
}
