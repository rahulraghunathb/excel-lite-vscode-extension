import * as vscode from "vscode"
import * as path from "path"
import { parseFile, TableModel } from "./fileParser"
import { ExcelPanel } from "./ExcelPanel"

/**
 * Provider for Excel Lite custom editor (allows making it the default viewer)
 */
class ExcelEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new ExcelEditorProvider(context)
    return vscode.window.registerCustomEditorProvider(
      ExcelEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  }

  private static readonly viewType = "excel-lite.viewer"

  constructor(private readonly context: vscode.ExtensionContext) { }

  public async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => { } }
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    try {
      const tableModel = await parseFile(document.uri.fsPath)
      new ExcelPanel(webviewPanel, this.context.extensionUri, tableModel)
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      vscode.window.showErrorMessage(`Failed to open custom editor: ${msg}`)
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log("[Excel Lite] Extension activated")

  // Register Custom Editor Provider
  context.subscriptions.push(ExcelEditorProvider.register(context))

  // Hello World command
  context.subscriptions.push(
    vscode.commands.registerCommand("excel-lite.helloWorld", () => {
      vscode.window.showInformationMessage("Hello World from Excel Lite!")
    })
  )

  // Open Viewer command
  context.subscriptions.push(
    vscode.commands.registerCommand("excel-lite.openViewer", async () => {
      let filePath: string | undefined
      const activeEditor = vscode.window.activeTextEditor
      if (activeEditor) {
        const ext = path.extname(activeEditor.document.uri.fsPath).toLowerCase()
        if ([".xlsx", ".xls", ".csv"].includes(ext)) {
          filePath = activeEditor.document.uri.fsPath
        }
      }

      if (!filePath) {
        const fileUri = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          filters: {
            "Excel/CSV Files": ["xlsx", "xls", "csv"],
            "All Files": ["*"],
          },
          title: "Select Excel or CSV file",
        })
        if (fileUri && fileUri[0]) filePath = fileUri[0].fsPath
      }

      if (!filePath) return

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Loading file...",
            cancellable: false,
          },
          async () => {
            const tableModel = await parseFile(filePath!)
            ExcelPanel.createOrShow(context.extensionUri, tableModel)
          }
        )
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error"
        vscode.window.showErrorMessage(`Failed to load file: ${msg}`)
      }
    })
  )

  /**
   * Helper to perform save operation
   */
  async function performSave(
    savePath: string,
    tableModel: TableModel,
    styles: Map<string, any>,
    silent: boolean = false
  ) {
    try {
      const { writeExcel, writeCsv } = await import("./fileWriter")
      const ext = path.extname(savePath).toLowerCase()
      if (ext === ".xlsx") await writeExcel(savePath, tableModel, styles)
      else if (ext === ".csv") await writeCsv(savePath, tableModel)
      else throw new Error("Unsupported file format")

      if (!silent) {
        vscode.window.showInformationMessage(
          `File saved: ${path.basename(savePath)}`
        )
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      vscode.window.showErrorMessage(`Failed to save file: ${msg}`)
    }
  }

  // Register internal save listener for ExcelPanel
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "excel-lite.internalSave",
      async (tableModel: TableModel, styles: Map<string, any>) => {
        await performSave(tableModel.filePath, tableModel, styles, true)
      }
    )
  )

  // Save Changes command
  context.subscriptions.push(
    vscode.commands.registerCommand("excel-lite.saveChanges", async () => {
      if (!ExcelPanel.currentPanel) {
        vscode.window.showWarningMessage("No Excel file is currently open")
        return
      }

      const panel = ExcelPanel.currentPanel
      const tableModel = panel.getTableModel()
      const styles = panel.getStyles()

      const choice = await vscode.window.showQuickPick(
        [
          { label: "Overwrite Original", description: tableModel.filePath },
          { label: "Save As...", description: "Choose a new location" },
        ],
        { placeHolder: "How would you like to save?" }
      )

      if (!choice) return

      let savePath = tableModel.filePath
      if (choice.label === "Save As...") {
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(tableModel.filePath),
          filters: { "Excel Files": ["xlsx"], "CSV Files": ["csv"] },
        })
        if (!uri) return
        savePath = uri.fsPath
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Saving file...",
          cancellable: false,
        },
        () => performSave(savePath, tableModel, styles)
      )
    })
  )
}

export function deactivate() { }
