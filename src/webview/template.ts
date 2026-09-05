/** Static markup for the webview shell; all data arrives by postMessage. */
export const bodyHtml = `
<div class="toolbar">
    <button id="boldBtn" title="Bold (applies to the selection)"><span class="icon">B</span>Bold</button>
    <label class="color-field" title="Fill colour">
        <input type="color" id="fillColor" value="#ffd966">
    </label>
    <button id="fillBtn" title="Apply fill colour">Fill</button>
    <button id="noFillBtn" title="Remove fill colour">No Fill</button>
    <span class="divider"></span>
    <button id="saveBtn" title="Save (Ctrl+S)">Save</button>
    <label class="toggle" title="Save automatically after every change">
        <input type="checkbox" id="autoSaveToggle">
        <span class="track"><span class="thumb"></span></span>
        Auto Save
    </label>
    <span class="spacer"></span>
    <button id="renameSheetBtn" title="Rename the active sheet">Rename Sheet</button>
    <button id="renameFileBtn" title="Rename the file on disk">Rename File</button>
    <label class="toggle" title="Override the VS Code theme">
        <input type="checkbox" id="themeToggle">
        <span class="track"><span class="thumb"></span></span>
        Dark
    </label>
    <span id="sheetName" class="sheet-name"></span>
</div>

<div class="grid-container" id="grid" tabindex="0">
    <table id="dataTable">
        <thead>
            <tr id="colLetters"></tr>
            <tr id="headRow"></tr>
        </thead>
        <tbody id="gridBody"></tbody>
    </table>
    <div id="loading">Loading…</div>
</div>

<div class="sheet-tabs hidden" id="sheetTabs"></div>

<div class="status-bar">
    <div id="selInfo">Click to select · double-click or F2 to edit</div>
    <div id="agg" class="hidden"></div>
    <span class="spacer"></span>
    <span id="rowCount"></span>
</div>
`
