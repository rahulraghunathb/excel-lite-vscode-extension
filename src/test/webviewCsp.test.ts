import { test, describe } from "node:test"
import assert from "node:assert/strict"

import { getHtmlShell } from "../webview/index"
import { Uri } from "./vscodeStub"

const webview = {
  cspSource: "vscode-webview://test",
  asWebviewUri: (uri: Uri) => uri,
}

function csp(): string {
  const html = getHtmlShell(webview as never, Uri.file("/ext") as never)
  const match = html.match(/Content-Security-Policy" content="([^"]*)"/)
  assert.ok(match, "shell has a Content-Security-Policy meta tag")
  return match[1]
}

describe("webview content security policy", () => {
  test("allows inline style attributes so virtual-scroll spacers keep their height", () => {
    assert.match(csp(), /style-src-attr 'unsafe-inline'/)
  })

  test("keeps style elements and scripts locked to the nonce", () => {
    const policy = csp()
    assert.match(policy, /style-src [^;]*'nonce-[A-Za-z0-9]{32}'/)
    assert.match(policy, /script-src 'nonce-[A-Za-z0-9]{32}'/)
    assert.doesNotMatch(policy, /script-src[^;]*unsafe-inline/)
    assert.doesNotMatch(policy, /style-src (?!-attr)[^;]*unsafe-inline/)
  })
})
