/** Static markup for the webview shell; all data arrives by postMessage. */
export const bodyHtml = `
<div class="toolbar">
    <button id="boldBtn" class="fmt" title="Bold"><b>B</b></button>
    <button id="italicBtn" class="fmt" title="Italic"><i>I</i></button>
    <button id="underlineBtn" class="fmt" title="Underline"><u>U</u></button>
    <span class="divider"></span>
    <label class="color-field" title="Text colour">
        <span class="color-glyph">A</span>
        <input type="color" id="fontColor" value="#c00000">
    </label>
    <button id="fontColorBtn" title="Apply text colour">Text</button>
    <label class="color-field" title="Fill colour">
        <input type="color" id="fillColor" value="#ffd966">
    </label>
    <button id="fillBtn" title="Apply fill colour">Fill</button>
    <button id="clearFormatBtn" title="Clear formatting from the selection">Clear</button>
    <span class="divider"></span>
    <button id="alignLeftBtn" class="fmt" title="Align left">&#8801;</button>
    <button id="alignCenterBtn" class="fmt" title="Align centre">&#8803;</button>
    <button id="alignRightBtn" class="fmt" title="Align right">&#8802;</button>
    <span class="divider"></span>
    <button id="findBtn" title="Find and replace (Ctrl+F)">Find</button>
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
</div>

<div class="formula-bar">
    <span class="cell-ref" id="cellRef">&nbsp;</span>
    <span class="fx">fx</span>
    <input type="text" id="formulaInput" spellcheck="false"
           placeholder="Select a cell to see its contents" disabled>
</div>

<div class="find-panel hidden" id="findPanel">
    <input type="text" id="findInput" placeholder="Find" spellcheck="false">
    <input type="text" id="replaceInput" placeholder="Replace with" spellcheck="false">
    <label class="mini" title="Match case"><input type="checkbox" id="matchCase">Aa</label>
    <label class="mini" title="Match entire cell"><input type="checkbox" id="wholeCell">[ ]</label>
    <span class="find-count" id="findCount"></span>
    <button id="findPrev" title="Previous match (Shift+Enter)">&#8593;</button>
    <button id="findNext" title="Next match (Enter)">&#8595;</button>
    <button id="replaceOne" title="Replace this match">Replace</button>
    <button id="replaceAll" title="Replace every match">All</button>
    <button id="findClose" title="Close (Escape)">&#10005;</button>
</div>

<div class="grid-container" id="grid" tabindex="0">
    <table id="dataTable">
        <thead>
            <tr id="colLetters"></tr>
            <tr id="headRow"></tr>
        </thead>
        <tbody id="gridBody"></tbody>
    </table>
    <div id="loading">Loading&#8230;</div>
</div>

<div class="sheet-tabs hidden" id="sheetTabs"></div>

<div class="status-bar">
    <div id="selInfo">Click to select &#183; double-click or F2 to edit</div>
    <div id="agg" class="hidden"></div>
    <span class="spacer"></span>
    <span id="sheetName" class="sheet-name"></span>
    <span id="rowCount"></span>
</div>

`
