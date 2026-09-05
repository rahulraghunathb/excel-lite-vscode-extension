/**
 * Static markup for the webview shell; all data arrives by postMessage.
 *
 * Icons are inline SVG rather than glyphs: the alignment controls in
 * particular are indistinguishable as unicode characters.
 */

const icon = (paths: string) =>
  `<svg class="ico" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">${paths}</svg>`

const bars = (widths: [number, number, number, number], anchor: "l" | "c" | "r") =>
  widths
    .map((width, index) => {
      const y = 3 + index * 3
      const x = anchor === "l" ? 2 : anchor === "r" ? 14 - width : (16 - width) / 2
      return `<rect x="${x}" y="${y}" width="${width}" height="1.6" rx="0.6"/>`
    })
    .join("")

const ICONS = {
  undo: icon(
    '<path d="M3.5 7.5h6a3 3 0 0 1 0 6H7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 4.5 3 7.5l3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  redo: icon(
    '<path d="M12.5 7.5h-6a3 3 0 0 0 0 6H9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10 4.5l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  alignLeft: icon(bars([12, 8, 12, 7], "l")),
  alignCenter: icon(bars([12, 8, 12, 7], "c")),
  alignRight: icon(bars([12, 8, 12, 7], "r")),
  clearFormat: icon(
    '<path d="M6 12.5h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9.2 3.2 4 8.4l2.6 2.6h2.2l4.4-4.4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  ),
  search: icon(
    '<circle cx="7" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m10.2 10.2 3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  ),
  save: icon(
    '<path d="M3 3h8l2 2v8H3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.5 3v3.5h5V3M5 13v-3.5h6V13" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  ),
  more: icon(
    '<circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/>',
  ),
  chevron: icon(
    '<path d="m5 6.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
}

export const bodyHtml = `
<div class="toolbar" role="toolbar" aria-label="Spreadsheet tools">
    <div class="group">
        <button id="undoBtn" class="icon-btn" title="Undo (Ctrl+Z)" aria-label="Undo">${ICONS.undo}</button>
        <button id="redoBtn" class="icon-btn" title="Redo (Ctrl+Y)" aria-label="Redo">${ICONS.redo}</button>
    </div>

    <span class="divider"></span>

    <div class="group">
        <button id="boldBtn" class="icon-btn text-btn" title="Bold (Ctrl+B)" aria-label="Bold"><b>B</b></button>
        <button id="italicBtn" class="icon-btn text-btn" title="Italic (Ctrl+I)" aria-label="Italic"><i>I</i></button>
        <button id="underlineBtn" class="icon-btn text-btn" title="Underline (Ctrl+U)" aria-label="Underline"><u>U</u></button>
    </div>

    <span class="divider"></span>

    <div class="group">
        <div class="split" title="Text colour">
            <button id="fontColorBtn" class="icon-btn split-main" aria-label="Apply text colour">
                <span class="swatch-glyph">A</span>
                <span class="swatch-bar" id="fontColorBar"></span>
            </button>
            <label class="split-arrow" title="Choose text colour">
                ${ICONS.chevron}
                <input type="color" id="fontColor" value="#c00000" aria-label="Text colour">
            </label>
        </div>
        <div class="split" title="Fill colour">
            <button id="fillBtn" class="icon-btn split-main" aria-label="Apply fill colour">
                <span class="swatch-glyph fill-glyph"></span>
                <span class="swatch-bar" id="fillColorBar"></span>
            </button>
            <label class="split-arrow" title="Choose fill colour">
                ${ICONS.chevron}
                <input type="color" id="fillColor" value="#ffd966" aria-label="Fill colour">
            </label>
        </div>
    </div>

    <span class="divider"></span>

    <div class="group">
        <button id="alignLeftBtn" class="icon-btn" title="Align left" aria-label="Align left">${ICONS.alignLeft}</button>
        <button id="alignCenterBtn" class="icon-btn" title="Align centre" aria-label="Align centre">${ICONS.alignCenter}</button>
        <button id="alignRightBtn" class="icon-btn" title="Align right" aria-label="Align right">${ICONS.alignRight}</button>
    </div>

    <span class="divider"></span>

    <button id="clearFormatBtn" class="icon-btn" title="Clear formatting from the selection" aria-label="Clear formatting">${ICONS.clearFormat}</button>
    <button id="findBtn" class="icon-btn" title="Find and replace (Ctrl+F)" aria-label="Find and replace">${ICONS.search}</button>

    <span class="spacer"></span>

    <button id="saveBtn" class="labelled" title="Save (Ctrl+S)">${ICONS.save}<span>Save</span></button>
    <label class="toggle" title="Save automatically after every change">
        <input type="checkbox" id="autoSaveToggle">
        <span class="track"><span class="thumb"></span></span>
        <span class="toggle-label">Auto</span>
    </label>
    <button id="moreBtn" class="icon-btn" title="More actions" aria-label="More actions" aria-haspopup="menu">${ICONS.more}</button>
</div>

<div class="formula-bar">
    <span class="cell-ref" id="cellRef"></span>
    <span class="fx" aria-hidden="true">fx</span>
    <input type="text" id="formulaInput" spellcheck="false" aria-label="Cell contents"
           placeholder="Select a cell to see its contents" disabled>
</div>

<div class="find-panel hidden" id="findPanel" role="search">
    <div class="find-field">
        <input type="text" id="findInput" placeholder="Find" spellcheck="false" aria-label="Find">
        <button id="matchCase" class="chip" title="Match case" aria-pressed="false">Aa</button>
        <button id="wholeCell" class="chip" title="Match entire cell contents" aria-pressed="false">Cell</button>
    </div>
    <span class="find-count" id="findCount"></span>
    <button id="findPrev" class="icon-btn" title="Previous match (Shift+Enter)" aria-label="Previous match">&#8593;</button>
    <button id="findNext" class="icon-btn" title="Next match (Enter)" aria-label="Next match">&#8595;</button>
    <input type="text" id="replaceInput" placeholder="Replace with" spellcheck="false" aria-label="Replace with">
    <button id="replaceOne" title="Replace this match">Replace</button>
    <button id="replaceAll" title="Replace every match">All</button>
    <span class="spacer"></span>
    <button id="findClose" class="icon-btn" title="Close (Escape)" aria-label="Close find">&#10005;</button>
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

<div class="sheet-tabs hidden" id="sheetTabs" role="tablist"></div>

<div class="status-bar">
    <span id="selInfo"></span>
    <span id="agg" class="hidden"></span>
    <span class="spacer"></span>
    <span id="sheetName" class="sheet-name hidden"></span>
    <span id="rowCount"></span>
</div>
`
