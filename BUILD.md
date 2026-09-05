# Build Instructions - Excel Lite

This document provides instructions for setting up, building, and maintaining the Excel Lite VS Code extension.

## Repository & Links

- **Author**: Rahul Raghunath Bodanki
- **GitHub**: [github.com/rahulraghunathb](https://github.com/rahulraghunathb)
- **Portfolio**: [portfolio-website-beta-two-82.vercel.app](https://portfolio-website-beta-two-82.vercel.app/)

## Prerequisites

- [Node.js](https://nodejs.org/) (v16.x or later)
- [npm](https://www.npmjs.com/) (usually comes with Node.js)

## Getting Started

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/rahulraghunathb/excel-lite-vscode-extension.git
    cd excel-lite-vscode-extension
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

## Development

The extension uses `esbuild` for fast bundling and `eslint` for code quality.

The project produces **two** bundles:

| Bundle              | Source                        | Runs in            |
| ------------------- | ----------------------------- | ------------------ |
| `dist/extension.js` | `src/extension.ts`            | Node (extension host) |
| `dist/webview.js`   | `src/webview/client/main.ts`  | Browser (webview)  |

They are type-checked separately, because only the webview may touch the DOM:
`tsconfig.json` covers the host and `src/webview/client/tsconfig.json` the client.

### Build Scripts

- **One-time build** — builds both bundles:

  ```bash
  npm run build
  ```

- **Watch mode** — rebuilds both on change:

  ```bash
  npm run watch
  ```

- **Tests** — 151 unit, round-trip and end-to-end tests:

  ```bash
  npm test
  ```

  `src/test/vscodeStub.ts` is aliased over the real `vscode` module at build
  time, so the document and panel run under `node --test` without an Extension
  Development Host.

- **Type checking** (both projects):

  ```bash
  npm run typecheck
  ```

- **Linting**:

  ```bash
  npm run lint
  ```

## Debugging

1.  Open this project in VS Code.
2.  Press `F5` or go to the **Run and Debug** view and select **Run Extension**.
3.  A new **Extension Development Host** window will open with the Excel Lite extension loaded.

## Packaging

To package the extension into a `.vsix` file for installation:

1.  Install `vsce` globally (if not already installed):

    ```bash
    npm install -g @vscode/vsce
    ```

2.  Run the packaging command:
    ```bash
    vsce package
    ```

This will generate an `excel-lite-<version>.vsix` file in the root directory.

## How to Install in VS Code

To install the extension without running it in a development host:

1.  **Open VS Code**.
2.  Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to open the **Command Palette**.
3.  Type `Extensions: Install from VSIX...` and select it.
4.  Navigate to the `excel-extension` folder and select the `.vsix` file (e.g., `excel-lite-2.0.0.vsix`).
5.  Once the installation is complete, click **Reload Now** if prompted.
6.  Excel Lite is registered as the default editor for `.xlsx`, `.xlsm`, `.csv`
    and `.tsv`. To open a file as raw text instead, right-click it and choose
    **Open With… → Text Editor**.

## Architecture

- `src/model.ts` — cell value union, display formatting, input coercion, colour
  validation. Pure, no VS Code dependency.
- `src/grid.ts` — filtering, sorting and aggregates. Pure, and unit tested directly.
- `src/structural.ts` — row/column insertion and removal, including the index
  shifting that keeps style keys and dirty-cell keys valid afterwards. Pure.
- `src/search.ts` — find and replace, matching on the text the editor shows.
- `src/fileParser.ts` / `src/fileWriter.ts` — parsing, and **patch-based** saving
  that preserves everything the model does not represent.
- `src/ExcelDocument.ts` — the `CustomDocument`: dirty tracking, undo/redo patches,
  backup for hot exit, conflict detection.
- `src/ExcelPanel.ts` — one webview per document; owns view state only.
- `src/webview/client/` — the browser-side grid (virtualised rendering, selection,
  keyboard handling, filter popup).

The webview receives **display strings only**, one window of rows at a time; raw
values never leave the extension host. Both sides therefore agree on what a cell
says, which is what makes filtering by date or by `0` behave correctly.
