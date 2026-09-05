import { EventEmitter } from "./vscodeStub"

export interface PostedMessage {
  type: string
  payload?: any
}

/**
 * A stand-in WebviewPanel that records what the extension sends and lets a
 * test send messages back, exactly as the real webview would.
 */
export class FakeWebviewPanel {
  public readonly posted: PostedMessage[] = []
  private readonly _messageEmitter = new EventEmitter<PostedMessage>()
  private readonly _disposeEmitter = new EventEmitter<void>()

  public html = ""
  public title = ""
  public disposed = false

  public readonly webview = {
    options: {} as unknown,
    cspSource: "vscode-webview://test",
    html: "",
    asWebviewUri: (uri: { fsPath: string }) => ({
      toString: () => `vscode-webview://test${uri.fsPath.replace(/\\/g, "/")}`,
    }),
    onDidReceiveMessage: this._messageEmitter.event,
    postMessage: async (message: PostedMessage) => {
      this.posted.push(message)
      return true
    },
  }

  public readonly onDidDispose = this._disposeEmitter.event

  public reveal() {}

  public dispose() {
    this.disposed = true
    this._disposeEmitter.fire()
  }

  /** Simulate the webview posting a message to the extension host. */
  public send(type: string, payload?: unknown) {
    this._messageEmitter.fire({ type, payload })
  }

  /** Most recent message of a given type, or undefined. */
  public last(type: string): PostedMessage | undefined {
    for (let i = this.posted.length - 1; i >= 0; i--) {
      if (this.posted[i].type === type) return this.posted[i]
    }
    return undefined
  }

  public all(type: string): PostedMessage[] {
    return this.posted.filter((message) => message.type === type)
  }

  public clear() {
    this.posted.length = 0
  }
}

/** Let queued promise callbacks (async message handlers) run. */
export async function flush(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
  await new Promise((resolve) => setImmediate(resolve))
}
