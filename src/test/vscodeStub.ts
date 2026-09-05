/**
 * Minimal in-memory stand-in for the `vscode` module.
 *
 * Aliased over the real module when building the integration tests, so
 * ExcelDocument and ExcelPanel can be exercised through their real code paths
 * without launching an Extension Development Host.
 */
import * as fsp from "fs/promises"
import * as nodePath from "path"

export class EventEmitter<T> {
  private _listeners: ((event: T) => void)[] = []

  public event = (
    listener: (event: T) => void,
    _thisArg?: unknown,
    disposables?: { dispose(): void }[],
  ) => {
    this._listeners.push(listener)
    const disposable = {
      dispose: () => {
        const index = this._listeners.indexOf(listener)
        if (index >= 0) this._listeners.splice(index, 1)
      },
    }
    disposables?.push(disposable)
    return disposable
  }

  public fire(value: T) {
    for (const listener of [...this._listeners]) listener(value)
  }

  public dispose() {
    this._listeners = []
  }
}

export class Uri {
  private constructor(
    public readonly fsPath: string,
    public readonly scheme = "file",
  ) {}
  public static file(path: string) {
    return new Uri(path)
  }
  public static joinPath(base: Uri, ...segments: string[]) {
    return new Uri(nodePath.join(base.fsPath, ...segments))
  }
  public toString() {
    return `${this.scheme}://${this.fsPath}`
  }
  public get path() {
    return this.fsPath.replace(/\\/g, "/")
  }
}

export class RelativePattern {
  constructor(
    public base: Uri | string,
    public pattern: string,
  ) {}
}

export class CancellationError extends Error {
  constructor() {
    super("Canceled")
    this.name = "Canceled"
  }
}

export enum ViewColumn {
  One = 1,
  Two = 2,
}

export class TabInputCustom {
  constructor(
    public uri: Uri,
    public viewType: string,
  ) {}
}
export class TabInputText {
  constructor(public uri: Uri) {}
}

/** Scripted responses so tests can drive modal prompts deterministically. */
export const harness = {
  infoMessages: [] as string[],
  warningMessages: [] as string[],
  errorMessages: [] as string[],
  /** Queue of answers returned by showWarningMessage, in order. */
  warningResponses: [] as (string | undefined)[],
  inputBoxResponses: [] as (string | undefined)[],
  openDialogResponses: [] as (Uri[] | undefined)[],
  executedCommands: [] as { command: string; args: unknown[] }[],
  clipboardText: "",
  /** Commands the test registers so executeCommand can route to them. */
  commandHandlers: new Map<string, (...args: unknown[]) => unknown>(),

  reset() {
    this.infoMessages = []
    this.warningMessages = []
    this.errorMessages = []
    this.warningResponses = []
    this.inputBoxResponses = []
    this.openDialogResponses = []
    this.executedCommands = []
    this.clipboardText = ""
    this.commandHandlers.clear()
  },
}

export const window = {
  showInformationMessage: async (message: string) => {
    harness.infoMessages.push(message)
    return undefined
  },
  showWarningMessage: async (message: string, ...rest: unknown[]) => {
    harness.warningMessages.push(message)
    void rest
    return harness.warningResponses.shift()
  },
  showErrorMessage: async (message: string) => {
    harness.errorMessages.push(message)
    return undefined
  },
  showInputBox: async (options?: { validateInput?: (value: string) => string | null }) => {
    const value = harness.inputBoxResponses.shift()
    if (value !== undefined && options?.validateInput) {
      const problem = options.validateInput(value)
      if (problem) return undefined
    }
    return value
  },
  showOpenDialog: async () => harness.openDialogResponses.shift(),
  showSaveDialog: async () => undefined,
  registerCustomEditorProvider: () => ({ dispose() {} }),
  createWebviewPanel: () => {
    throw new Error("not implemented in the stub")
  },
  activeTextEditor: undefined as unknown,
  tabGroups: { activeTabGroup: { activeTab: undefined as unknown } },
  withProgress: async <T>(_options: unknown, task: () => Thenable<T>) => task(),
}

export const commands = {
  registerCommand: (command: string, handler: (...args: unknown[]) => unknown) => {
    harness.commandHandlers.set(command, handler)
    return { dispose: () => harness.commandHandlers.delete(command) }
  },
  executeCommand: async (command: string, ...args: unknown[]) => {
    harness.executedCommands.push({ command, args })
    const handler = harness.commandHandlers.get(command)
    if (handler) return handler(...args)
    return undefined
  },
}

export const env = {
  clipboard: {
    readText: async () => harness.clipboardText,
    writeText: async (text: string) => {
      harness.clipboardText = text
    },
  },
}

export const workspace = {
  fs: {
    rename: async (source: Uri, target: Uri) => {
      await fsp.rename(source.fsPath, target.fsPath)
    },
    delete: async (target: Uri) => {
      await fsp.rm(target.fsPath, { force: true })
    },
  },
  createFileSystemWatcher: () => ({
    onDidChange: (_listener: unknown) => ({ dispose() {} }),
    onDidCreate: (_listener: unknown) => ({ dispose() {} }),
    onDidDelete: (_listener: unknown) => ({ dispose() {} }),
    dispose() {},
  }),
  getConfiguration: () => ({ get: () => undefined }),
}

export const ProgressLocation = { Notification: 15 }

export default {
  EventEmitter,
  Uri,
  RelativePattern,
  CancellationError,
  ViewColumn,
  TabInputCustom,
  TabInputText,
  window,
  commands,
  env,
  workspace,
  ProgressLocation,
}
