/**
 * Webview CSS Styles
 * Organized by component/section
 */

export const cssVariables = `
:root {
    --bg-primary: var(--vscode-editor-background);
    --bg-secondary: var(--vscode-sideBar-background);
    --bg-header: var(--vscode-editorGroupHeader-tabsBackground);
    --border-color: var(--vscode-panel-border);
    --text-primary: var(--vscode-editor-foreground);
    --text-secondary: var(--vscode-descriptionForeground);
    --accent: var(--vscode-focusBorder);
    --selection: color-mix(in srgb, var(--vscode-editor-selectionBackground) 60%, transparent);
    --toolbar-height: 44px;
    --status-height: 26px;
    --sheet-height: 30px;
    --letter-height: 26px;
    --header-height: 34px;
}

body[data-theme="light"] {
    --bg-primary: #f5f6f8;
    --bg-secondary: #ffffff;
    --bg-header: #eef0f3;
    --border-color: #d0d4da;
    --text-primary: #1f2328;
    --text-secondary: #6b7280;
    --accent: #1f6feb;
    --selection: rgba(31, 111, 235, 0.2);
}

body[data-theme="dark"] {
    --bg-primary: #1e1e1e;
    --bg-secondary: #252526;
    --bg-header: #2d2d30;
    --border-color: #3c3c3c;
    --text-primary: #cccccc;
    --text-secondary: #9d9d9d;
    --accent: #0e639c;
    --selection: rgba(14, 99, 156, 0.4);
}
`;

export const baseStyles = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: "Source Sans 3", "Segoe UI", sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    overflow: hidden;
    height: 100vh;
    display: flex;
    flex-direction: column;
}
`;

export const toolbarStyles = `
.toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    min-height: var(--toolbar-height);
    background: linear-gradient(180deg, var(--bg-secondary), color-mix(in srgb, var(--bg-secondary) 80%, var(--bg-primary)));
    border-bottom: 1px solid var(--border-color);
    box-shadow: 0 1px 0 rgba(0,0,0,0.08);
    flex-wrap: wrap;
    user-select: none;
}
.toolbar button { font-weight: 600; text-transform: none; }
.toolbar .icon { font-size: 12px; opacity: 0.75; line-height: 1; }
.toolbar .spacer { width: 1px; height: 20px; background: var(--border-color); margin: 0 4px; }
`;

export const gridStyles = `
.grid-container {
    flex: 1;
    overflow: auto;
    position: relative;
    background: var(--bg-primary);
}

table {
    border-collapse: separate;
    border-spacing: 0;
    width: 100%;
    font-size: 12px;
    line-height: 1.4;
    table-layout: fixed;
}

thead th {
    position: sticky;
    z-index: 10;
    background: var(--bg-header);
    border-bottom: 1px solid var(--border-color);
    border-right: 1px solid var(--border-color);
    padding: 0;
    font-weight: 600;
    text-align: left;
}

thead tr:first-child th {
    top: 0;
    height: 28px;
    line-height: 28px;
    padding: 0 8px;
    text-align: center;
    font-size: 11px;
    color: var(--text-secondary);
}

thead tr:nth-child(2) th {
    top: 28px;
    height: 36px;
    padding: 6px 28px 6px 10px;
}

th:first-child, td:first-child {
    position: sticky;
    left: 0;
    z-index: 11;
    background: var(--bg-secondary);
    text-align: center;
    width: 50px;
    min-width: 50px;
    max-width: 50px;
    border-right: 1px solid var(--border-color);
}

thead th:first-child { z-index: 12; cursor: pointer; }
thead th:first-child:hover { background: var(--bg-header); }

th.col-letter { position: relative; }
th.header-cell { position: relative; line-height: 1.4; vertical-align: middle; }

td.row-header {
    background: var(--bg-secondary);
    font-size: 11px;
    color: var(--text-secondary);
    position: relative;
    line-height: 1.4;
    vertical-align: middle;
}

td {
    border-bottom: 1px solid var(--border-color);
    border-right: 1px solid var(--border-color);
    padding: 6px 10px;
    overflow: hidden;
    cursor: cell;
    vertical-align: top;
}

td.selected {
    background: var(--selection) !important;
    outline: 2px solid var(--accent);
    outline-offset: -2px;
}

th.col-selected, td.row-selected {
    background: color-mix(in srgb, var(--selection) 70%, transparent);
}
`;

export const resizerStyles = `
.col-resizer {
    position: absolute;
    top: 0;
    right: 0;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 20;
    background: transparent;
}
.col-resizer:hover, .col-resizer.active { background: var(--accent); }

.row-resizer {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 4px;
    width: 100%;
    cursor: row-resize;
    z-index: 20;
    background: transparent;
}
.row-resizer:hover, .row-resizer.active { background: var(--accent); }
`;

export const filterPopupStyles = `
.filter-popup {
    display: none;
    position: absolute;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    padding: 10px;
    z-index: 100;
    box-shadow: 0 12px 28px rgba(0,0,0,0.25);
    width: 240px;
    border-radius: 10px;
}
.filter-popup.show { display: block; }

.filter-section { padding: 6px 0; border-bottom: 1px solid var(--border-color); }
.filter-section:last-child { border-bottom: none; }

.filter-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
}
.filter-item:hover { background: color-mix(in srgb, var(--selection) 45%, transparent); }
.filter-item .arrow { margin-left: auto; opacity: 0.6; }

.filter-subtitle { font-size: 11px; color: var(--text-secondary); margin: 4px 0 8px; }

.filter-actions { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
.filter-actions button { padding: 0; background: none; border: none; color: var(--accent); cursor: pointer; }

.filter-search {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    padding: 6px 8px;
    border-radius: 6px;
    margin: 8px 0;
}
.filter-search input { border: none; outline: none; background: transparent; color: var(--text-primary); width: 100%; }

.filter-values { max-height: 160px; overflow: auto; padding-right: 4px; }
.filter-values label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px;
    border-radius: 4px;
    cursor: pointer;
}
.filter-values label:hover { background: color-mix(in srgb, var(--selection) 45%, transparent); }

.filter-footer { display: flex; justify-content: space-between; gap: 8px; padding-top: 10px; }
.filter-footer button { flex: 1; padding: 6px 8px; border-radius: 4px; border: 1px solid transparent; cursor: pointer; font-weight: 600; }
.filter-footer .cancel { background: transparent; border-color: var(--border-color); color: var(--text-primary); }
.filter-footer .ok { background: #1a7f37; color: white; }

.filter-icon {
    font-size: 11px;
    opacity: 0.6;
    padding: 0;
    cursor: pointer;
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
}
.filter-icon:hover { opacity: 1; }
`;

export const statusBarStyles = `
.status-bar {
    padding: 4px 12px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-color);
    font-size: 11px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: var(--status-height);
    user-select: none;
}
`;

export const sheetTabsStyles = `
.sheet-tabs {
    display: flex;
    gap: 8px;
    padding: 4px 10px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-color);
    overflow-x: auto;
    height: var(--sheet-height);
    align-items: center;
    user-select: none;
}

.sheet-tab {
    padding: 4px 12px;
    border-radius: 999px;
    cursor: pointer;
    font-size: 12px;
    background: transparent;
    border: 1px solid var(--border-color);
    white-space: nowrap;
    color: var(--text-secondary);
    transition: all 0.15s ease;
}

.sheet-tab.active {
    background: #1a7f37;
    color: white;
    border-color: #1a7f37;
    box-shadow: 0 6px 14px rgba(26, 127, 55, 0.25);
}
`;

export const componentStyles = `
button {
    background: var(--bg-header);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    padding: 5px 10px;
    cursor: pointer;
    border-radius: 8px;
    font-size: 12px;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
button:hover { background: color-mix(in srgb, var(--bg-header) 70%, var(--accent)); color: white; }

.toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; }
.toggle input { display: none; }
.toggle .track {
    width: 38px;
    height: 20px;
    border-radius: 999px;
    background: var(--border-color);
    position: relative;
    transition: background 0.2s ease;
}
.toggle .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    transition: transform 0.2s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
}
.toggle input:checked + .track { background: #1a7f37; }
.toggle input:checked + .track .thumb { transform: translateX(18px); }

#fillColor {
    width: 26px;
    height: 26px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0;
    background: transparent;
    cursor: pointer;
}

#sheetName {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--border-color);
    background: var(--bg-header);
    font-size: 12px;
}

#loading {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.edit-input {
    position: absolute;
    border: 2px solid var(--accent);
    background: var(--bg-primary);
    color: var(--text-primary);
    z-index: 50;
    padding: 6px 8px;
    font-family: inherit;
    user-select: text;
}
`;

/**
 * Get all styles combined
 */
export function getAllStyles(): string {
    return [
        cssVariables,
        baseStyles,
        toolbarStyles,
        gridStyles,
        resizerStyles,
        filterPopupStyles,
        statusBarStyles,
        sheetTabsStyles,
        componentStyles
    ].join('\n');
}
