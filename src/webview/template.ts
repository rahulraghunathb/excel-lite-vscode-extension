/**
 * HTML Template Components
 */

export const toolbarHtml = `
<div class="toolbar">
    <button id="boldBtn" title="Bold"><span class="icon">𝐁</span>Bold</button>
    <input type="color" id="fillColor" value="#0e639c">
    <button id="fillBtn" title="Fill Color"><span class="icon">⬛</span>Fill</button>
    <button id="noFillBtn" title="No Fill"><span class="icon">⬜</span>No Fill</button>
    <div class="spacer"></div>
    <label class="toggle">
        <input type="checkbox" id="autoSaveToggle">
        <span class="track"><span class="thumb"></span></span>
        Auto Save
    </label>
    <label class="toggle">
        <input type="checkbox" id="themeToggle">
        <span class="track"><span class="thumb"></span></span>
        Dark Mode
    </label>
    <span style="flex:1"></span>
    <button id="renameFileBtn" title="Rename File"><span class="icon">✎</span>Rename File</button>
    <button id="renameSheetBtn" title="Rename Sheet"><span class="icon">✎</span>Rename Sheet</button>
    <span id="sheetName" style="font-size: 12px; font-weight: 500;"></span>
</div>
`;

export const gridHtml = `
<div class="grid-container" id="grid">
    <table id="dataTable">
        <thead>
            <tr id="colLetters"></tr>
            <tr id="headRow"></tr>
        </thead>
        <tbody id="gridBody"></tbody>
    </table>
</div>
`;

export const statusBarHtml = `
<div class="status-bar">
    <div id="selInfo">Click to select | Double-click to edit</div>
    <div id="agg" style="display:none">
        <span id="sumWrap">SUM: <span id="sVal"></span> | </span>
        COUNT: <span id="cVal"></span>
        <span id="avgWrap"> | AVG: <span id="aVal"></span></span>
    </div>
</div>
`;

export const sheetTabsHtml = `<div class="sheet-tabs" id="sheetTabs"></div>`;

export const loadingHtml = `<div id="loading">Loading Data...</div>`;

/**
 * Generate filter popup HTML for a column
 */
export function getFilterPopupHtml(colIndex: number): string {
    return `
<div class="filter-popup" data-col="${colIndex}">
    <div class="filter-section">
        <div class="filter-item" data-action="sort-asc">Sort A to Z</div>
        <div class="filter-item" data-action="sort-desc">Sort Z to A</div>
        <div class="filter-item" data-action="sort-color">Sort by colour <span class="arrow">▶</span></div>
    </div>
    <div class="filter-section">
        <div class="filter-item" data-action="filter-color">Filter by colour <span class="arrow">▶</span></div>
        <div class="filter-item" data-action="filter-condition">Filter by condition <span class="arrow">▶</span></div>
        <div class="filter-item" data-action="filter-values">Filter by values</div>
    </div>
    <div class="filter-section">
        <div class="filter-actions">
            <div>
                <button class="select-all" type="button">Select all</button>
                <span>•</span>
                <button class="clear" type="button">Clear</button>
            </div>
            <div class="displaying">Displaying 0</div>
        </div>
        <div class="filter-search">
            <input type="text" placeholder="Search">
            <span>🔍</span>
        </div>
        <div class="filter-values"></div>
    </div>
    <div class="filter-footer">
        <button class="cancel" type="button">Cancel</button>
        <button class="ok" type="button">OK</button>
    </div>
</div>`;
}
