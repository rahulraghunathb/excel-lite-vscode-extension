/**
 * Webview CSS.
 *
 * Colours default to the VS Code theme variables so the grid matches the
 * editor; the explicit dark/light overrides only apply when the user forces a
 * theme with the toolbar toggle.
 */
export const css = `
:root {
    --bg: var(--vscode-editor-background, #1e1e1e);
    --bg-alt: var(--vscode-sideBar-background, #252526);
    --bg-header: var(--vscode-editorGroupHeader-tabsBackground, #2d2d30);
    --border: var(--vscode-panel-border, #3c3c3c);
    --grid-line: var(--vscode-editorIndentGuide-background, #3c3c3c);
    --fg: var(--vscode-editor-foreground, #cccccc);
    --fg-dim: var(--vscode-descriptionForeground, #9d9d9d);
    --accent: var(--vscode-focusBorder, #0e639c);
    --selection: var(--vscode-editor-selectionBackground, rgba(14,99,156,.4));
    --btn-bg: var(--vscode-button-secondaryBackground, #3a3d41);
    --btn-fg: var(--vscode-button-secondaryForeground, #ffffff);
    --toolbar-h: 40px;
    --status-h: 24px;
}

body[data-theme="light"] {
    --bg: #ffffff; --bg-alt: #f6f7f9; --bg-header: #eef0f3;
    --border: #d0d4da; --grid-line: #e3e6ea;
    --fg: #1f2328; --fg-dim: #6b7280;
    --accent: #1f6feb; --selection: rgba(31,111,235,.18);
    --btn-bg: #e7e9ec; --btn-fg: #1f2328;
}
body[data-theme="dark"] {
    --bg: #1e1e1e; --bg-alt: #252526; --bg-header: #2d2d30;
    --border: #3c3c3c; --grid-line: #333333;
    --fg: #cccccc; --fg-dim: #9d9d9d;
    --accent: #0e639c; --selection: rgba(14,99,156,.4);
    --btn-bg: #3a3d41; --btn-fg: #ffffff;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
    font-family: var(--vscode-font-family, "Segoe UI", system-ui, sans-serif);
    font-size: 13px;
    background: var(--bg);
    color: var(--fg);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.hidden { display: none !important; }
.spacer { flex: 1; }

/* ------------------------------------------------------------------ toolbar */

.toolbar {
    height: var(--toolbar-h);
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    background: var(--bg-alt);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    white-space: nowrap;
}

.toolbar button {
    height: 26px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: var(--btn-bg);
    color: var(--btn-fg);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
}
.toolbar button:hover { border-color: var(--accent); }
.toolbar button:active { transform: translateY(1px); }
.toolbar .icon { font-weight: 700; font-family: Georgia, serif; }
.toolbar .divider { width: 1px; height: 18px; background: var(--border); margin: 0 2px; }

.color-field { display: inline-flex; align-items: center; }
.color-field input[type="color"] {
    width: 26px; height: 26px; padding: 0;
    border: 1px solid var(--border); border-radius: 4px;
    background: none; cursor: pointer;
}

.sheet-name { font-size: 12px; font-weight: 600; color: var(--fg-dim); padding-left: 4px; }

.toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    cursor: pointer;
    user-select: none;
}
.toggle input { position: absolute; opacity: 0; pointer-events: none; }
.toggle .track {
    width: 28px; height: 15px; border-radius: 8px;
    background: var(--btn-bg); border: 1px solid var(--border);
    position: relative; transition: background .15s;
}
.toggle .thumb {
    position: absolute; top: 1px; left: 1px;
    width: 11px; height: 11px; border-radius: 50%;
    background: var(--fg-dim); transition: transform .15s, background .15s;
}
.toggle input:checked + .track { background: var(--accent); }
.toggle input:checked + .track .thumb { transform: translateX(13px); background: #fff; }
.toggle input:focus-visible + .track { outline: 1px solid var(--accent); outline-offset: 1px; }

/* --------------------------------------------------------------------- grid */

.grid-container {
    flex: 1 1 auto;
    overflow: auto;
    position: relative;
    outline: none;
}
.grid-container:focus-visible { box-shadow: inset 0 0 0 1px var(--accent); }

table {
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    width: max-content;
}

thead { position: sticky; top: 0; z-index: 30; }

th, td {
    border-right: 1px solid var(--grid-line);
    border-bottom: 1px solid var(--grid-line);
    padding: 0 7px;
    text-align: left;
    font-weight: normal;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
}

th {
    background: var(--bg-header);
    position: relative;
    user-select: none;
    font-size: 12px;
}

tr:first-child th { height: 22px; }
.col-letter {
    text-align: center;
    color: var(--fg-dim);
    font-size: 11px;
    cursor: pointer;
}
.col-letter:hover { background: var(--selection); }

.header-cell { height: 30px; font-weight: 600; }
.header-cell .header-text {
    cursor: pointer;
    display: inline-block;
    max-width: calc(100% - 18px);
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: middle;
}
.header-cell.sorted-asc .header-text::after { content: " ▲"; font-size: 9px; color: var(--accent); }
.header-cell.sorted-desc .header-text::after { content: " ▼"; font-size: 9px; color: var(--accent); }

.filter-icon {
    position: absolute;
    right: 3px; top: 50%;
    transform: translateY(-50%);
    font-size: 9px;
    padding: 3px 4px;
    border-radius: 3px;
    cursor: pointer;
    color: var(--fg-dim);
}
.filter-icon:hover { background: var(--selection); color: var(--fg); }
.header-cell.filtered .filter-icon { color: var(--accent); background: var(--selection); }

th.corner { background: var(--bg-header); text-align: center; color: var(--fg-dim); cursor: pointer; }
th.col-selected, td.row-selected { background: var(--selection); }

td.cell { background: var(--bg); cursor: cell; }
td.cell.numeric { text-align: right; font-variant-numeric: tabular-nums; }
td.cell.selected { background: var(--selection); }
td.cell.cursor { box-shadow: inset 0 0 0 2px var(--accent); }

td.row-header {
    background: var(--bg-header);
    color: var(--fg-dim);
    text-align: center;
    font-size: 11px;
    position: sticky;
    left: 0;
    z-index: 10;
    cursor: pointer;
    user-select: none;
}

tr.spacer td { border: none; padding: 0; background: var(--bg); }

/* ------------------------------------------------------------------ resizers */

.col-resizer {
    position: absolute;
    top: 0; right: -3px;
    width: 6px; height: 100%;
    cursor: col-resize;
    z-index: 40;
}
.row-resizer {
    position: absolute;
    left: 0; bottom: -3px;
    width: 100%; height: 6px;
    cursor: row-resize;
    z-index: 15;
}
.col-resizer:hover, .col-resizer.active,
.row-resizer:hover, .row-resizer.active { background: var(--accent); opacity: .6; }

/* -------------------------------------------------------------------- editor */

.edit-input {
    position: fixed;
    z-index: 500;
    border: 2px solid var(--accent);
    background: var(--bg);
    color: var(--fg);
    font-family: inherit;
    font-size: 13px;
    padding: 0 5px;
    outline: none;
}

/* -------------------------------------------------------------- filter popup */

.filter-popup {
    position: fixed;
    z-index: 600;
    background: var(--bg-alt);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 6px 20px rgba(0,0,0,.35);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-size: 12px;
}

.filter-section { display: flex; flex-direction: column; padding: 4px; border-bottom: 1px solid var(--border); }
.filter-item {
    text-align: left;
    padding: 6px 10px;
    border: none;
    background: none;
    color: var(--fg);
    font: inherit;
    border-radius: 4px;
    cursor: pointer;
}
.filter-item:hover { background: var(--selection); }

.filter-tabs { display: flex; gap: 2px; padding: 4px; border-bottom: 1px solid var(--border); }
.filter-tab {
    flex: 1;
    padding: 5px 4px;
    border: none;
    background: none;
    color: var(--fg-dim);
    font: inherit;
    border-radius: 4px;
    cursor: pointer;
}
.filter-tab:hover { background: var(--selection); }
.filter-tab.active { background: var(--accent); color: #fff; }

.filter-pane { padding: 8px; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.filter-actions { display: flex; align-items: center; gap: 8px; }
.filter-actions .link {
    background: none; border: none; color: var(--accent);
    cursor: pointer; font: inherit; padding: 0; text-decoration: underline;
}
.displaying { margin-left: auto; color: var(--fg-dim); font-size: 11px; }

.filter-search input,
.condition-op, .condition-value, .condition-value2 {
    width: 100%;
    padding: 5px 7px;
    background: var(--vscode-input-background, var(--bg));
    color: var(--vscode-input-foreground, var(--fg));
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
}

.filter-values, .filter-colors { max-height: 180px; overflow: auto; display: flex; flex-direction: column; }
.filter-value {
    display: flex; align-items: center; gap: 7px;
    padding: 3px 4px; border-radius: 3px; cursor: pointer;
}
.filter-value:hover { background: var(--selection); }
.filter-value span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.swatch { width: 13px; height: 13px; border-radius: 3px; border: 1px solid var(--border); flex: 0 0 auto; }
.swatch.none {
    background: repeating-linear-gradient(45deg, transparent, transparent 3px, var(--fg-dim) 3px, var(--fg-dim) 4px);
}

.filter-footer {
    display: flex; align-items: center; gap: 6px;
    padding: 8px; border-top: 1px solid var(--border);
}
.filter-footer .grow { flex: 1; }
.filter-footer button {
    padding: 5px 12px; border-radius: 4px; font: inherit; cursor: pointer;
    border: 1px solid var(--border);
}
.filter-footer .primary {
    background: var(--vscode-button-background, var(--accent));
    color: var(--vscode-button-foreground, #fff);
    border-color: transparent;
}
.filter-footer .secondary { background: var(--btn-bg); color: var(--btn-fg); }

/* ---------------------------------------------------------- tabs + statusbar */

.sheet-tabs {
    flex: 0 0 auto;
    display: flex;
    gap: 2px;
    padding: 3px 8px;
    background: var(--bg-alt);
    border-top: 1px solid var(--border);
    overflow-x: auto;
}
.sheet-tab {
    padding: 4px 12px;
    border: 1px solid transparent;
    border-radius: 4px 4px 0 0;
    background: none;
    color: var(--fg-dim);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
}
.sheet-tab:hover { background: var(--selection); }
.sheet-tab.active { background: var(--bg); color: var(--fg); border-color: var(--border); border-bottom-color: transparent; }

.status-bar {
    height: var(--status-h);
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 12px;
    background: var(--bg-alt);
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--fg-dim);
}
#agg { font-variant-numeric: tabular-nums; color: var(--fg); }
#rowCount.filtered { color: var(--accent); }

#loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    color: var(--fg-dim);
    z-index: 100;
}
`
