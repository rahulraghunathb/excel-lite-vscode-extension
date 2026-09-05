import { test, describe, beforeEach } from "node:test"
import assert from "node:assert/strict"
import * as path from "path"
import * as fs from "fs"

import { activate, deactivate } from "../extension"
import { Uri, harness } from "./vscodeStub"

function fakeContext() {
  return {
    subscriptions: [] as { dispose(): void }[],
    extensionUri: Uri.file(path.join(process.cwd(), "ext")),
  }
}

beforeEach(() => harness.reset())

describe("activation", () => {
  test("registers every contributed command without throwing", () => {
    const context = fakeContext()
    activate(context as never)

    for (const command of [
      "excel-lite.openViewer",
      "excel-lite.saveChanges",
      "excel-lite.saveAs",
    ]) {
      assert.ok(
        harness.commandHandlers.has(command),
        `${command} should be registered`,
      )
    }
    assert.ok(context.subscriptions.length >= 4)
    deactivate()
  })

  test("commands contributed in package.json all exist in code", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"),
    )
    const context = fakeContext()
    activate(context as never)

    for (const entry of manifest.contributes.commands) {
      assert.ok(
        harness.commandHandlers.has(entry.command),
        `${entry.command} is contributed but never registered`,
      )
    }
  })

  test("openViewer routes through the custom editor", async () => {
    const context = fakeContext()
    activate(context as never)

    const target = Uri.file(path.join(process.cwd(), "sample.xlsx"))
    await harness.commandHandlers.get("excel-lite.openViewer")!(target)

    const opened = harness.executedCommands.find(
      (entry) => entry.command === "vscode.openWith",
    )
    assert.ok(opened, "should delegate to vscode.openWith")
    assert.equal(opened!.args[1], "excel-lite.viewer")
  })

  test("openViewer refuses .xls with an actionable message", async () => {
    const context = fakeContext()
    activate(context as never)

    await harness.commandHandlers.get("excel-lite.openViewer")!(
      Uri.file(path.join(process.cwd(), "legacy.xls")),
    )
    assert.match(harness.errorMessages[0], /re-save as \.xlsx/)
    assert.equal(
      harness.executedCommands.some((e) => e.command === "vscode.openWith"),
      false,
    )
  })

  test("saveChanges warns when no spreadsheet is open", async () => {
    const context = fakeContext()
    activate(context as never)
    await harness.commandHandlers.get("excel-lite.saveChanges")!()
    assert.match(harness.warningMessages[0], /No spreadsheet/)
  })
})

describe("manifest", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"),
  )

  test("does not advertise .xls anywhere", () => {
    const serialised = JSON.stringify(manifest.contributes)
    assert.equal(
      /\.xls\b(?!x|m)/.test(serialised),
      false,
      "the manifest must not claim .xls support",
    )
  })

  test("custom editor selectors and menus agree on the supported types", () => {
    const patterns = manifest.contributes.customEditors[0].selector.map(
      (entry: { filenamePattern: string }) => entry.filenamePattern,
    )
    assert.deepEqual(patterns, ["*.xlsx", "*.xlsm", "*.csv", "*.tsv"])

    for (const group of Object.values(manifest.contributes.menus) as any[]) {
      for (const item of group) {
        for (const extension of ["xlsx", "xlsm", "csv", "tsv"]) {
          assert.ok(
            item.when.includes(`.${extension}`),
            `${item.command} menu should cover .${extension}`,
          )
        }
      }
    }
  })

  test("activation is contribution-driven, not on every startup", () => {
    assert.deepEqual(
      manifest.activationEvents,
      [],
      "onStartupFinished loads exceljs on every VS Code launch",
    )
  })
})
