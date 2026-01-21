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

### Build Scripts

- **One-time build**:

  ```bash
  npm run build
  ```

  Compiles and bundles the extension into the `dist` directory.

- **Watch mode**:

  ```bash
  npm run watch
  ```

  Starts a build task that watches for changes in the `src` directory and rebuilds automatically. This is recommended during development.

- **Linting**:
  ```bash
  npm run lint
  ```
  Runs ESLint to check for code quality and style issues in the `src` directory.

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
4.  Navigate to the `excel-extension` folder and select the `.vsix` file (e.g., `excel-lite-0.0.1.vsix`).
5.  Once the installation is complete, click **Reload Now** if prompted.
6.  The extension is now permanently installed. You can open any `.xlsx` or `.csv` file, right-click, and select "Open With..." -> "Excel Lite Viewer" to use it.
