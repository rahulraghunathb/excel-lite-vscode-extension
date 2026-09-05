import * as vscode from "vscode"
import { css } from "./styles"
import { bodyHtml } from "./template"

/** Cryptographically-random nonce so the CSP can whitelist exactly one script. */
function makeNonce(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let nonce = ""
  for (let i = 0; i < 32; i++) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length))
  }
  return nonce
}

/**
 * Build the webview shell.
 *
 * The Content-Security-Policy is the backstop for untrusted workbook content:
 * `default-src 'none'` plus a nonce means even if some value did escape into
 * the markup, it could not load or run a script.
 */
export function getHtmlShell(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview.js"),
  )
  const nonce = makeNonce()

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    img-src ${webview.cspSource} data:;
    style-src ${webview.cspSource} 'nonce-${nonce}';
    font-src ${webview.cspSource};
    script-src 'nonce-${nonce}';">
<title>Excel Lite</title>
<style nonce="${nonce}">
${css}
</style>
</head>
<body>
${bodyHtml}
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
}
