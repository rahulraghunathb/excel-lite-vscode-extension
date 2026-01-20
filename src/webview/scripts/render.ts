/**
 * Rendering Functions
 */

export const renderScript = `
// ============================================
// RENDERING
// ============================================

function renderGrid(data) {
    loading.style.display = 'none';
    currentRows = data.rows;
    numCols = data.headers.length;
    document.getElementById('sheetName').innerText = data.sheetName;
    document.getElementById('autoSaveToggle').checked = data.isAutoSaveEnabled;
    renderSheetTabs(data);

    // Initialize column widths if not set
    for (let i = 0; i < numCols; i++) {
        if (!columnWidths[i]) columnWidths[i] = DEFAULT_COL_WIDTH;
    }

    // Render Column Letters
    let lettersHtml = '<th style="width:50px"></th>';
    for (let i = 0; i < numCols; i++) {
        const w = columnWidths[i];
        lettersHtml += '<th class="col-letter" data-col="' + i + '" style="width:' + w + 'px">' +
            getColumnLetter(i) + '<div class="col-resizer" data-col="' + i + '"></div></th>';
    }
    colLetters.innerHTML = lettersHtml;

    // Render Headers
    let hHtml = '<th id="selectAll">#</th>';
    data.headers.forEach((h, i) => {
        const w = columnWidths[i];
        hHtml += '<th class="header-cell" data-col="' + i + '" style="width:' + w + 'px">' +
            escapeHtml(h) + '<span class="filter-icon">▼</span>' +
            getFilterPopupHtml(i) +
            '<div class="col-resizer" data-col="' + i + '"></div>' +
        '</th>';
    });
    headRow.innerHTML = hHtml;

    // Render Body
    let bHtml = '';
    data.rows.forEach((row, dIdx) => {
        const oIdx = data.originalIndices[dIdx];
        const rh = rowHeights[dIdx] || DEFAULT_ROW_HEIGHT;
        bHtml += '<tr><td class="row-header" data-row-idx="' + dIdx + '" style="height:' + rh + 'px">' +
            (oIdx + 1) + '<div class="row-resizer" data-row="' + dIdx + '"></div></td>';
        row.forEach((cell, cIdx) => {
            const style = data.styles[oIdx + ',' + cIdx] || {};
            const styleAttr = (style.bold ? 'font-weight:bold;' : '') +
                (style.bgColor ? 'background-color:' + style.bgColor + ';' : '');
            bHtml += '<td data-row="' + dIdx + '" data-col="' + cIdx + '" style="' + styleAttr + 'height:' + rh + 'px">' +
                escapeHtml(String(cell ?? '')) + '</td>';
        });
        bHtml += '</tr>';
    });
    gridBody.innerHTML = bHtml;
    attachEvents();
}

function getFilterPopupHtml(colIndex) {
    return '<div class="filter-popup" data-col="' + colIndex + '">' +
        '<div class="filter-section">' +
            '<div class="filter-item" data-action="sort-asc">Sort A to Z</div>' +
            '<div class="filter-item" data-action="sort-desc">Sort Z to A</div>' +
            '<div class="filter-item" data-action="sort-color">Sort by colour <span class="arrow">▶</span></div>' +
        '</div>' +
        '<div class="filter-section">' +
            '<div class="filter-item" data-action="filter-color">Filter by colour <span class="arrow">▶</span></div>' +
            '<div class="filter-item" data-action="filter-condition">Filter by condition <span class="arrow">▶</span></div>' +
            '<div class="filter-item" data-action="filter-values">Filter by values</div>' +
        '</div>' +
        '<div class="filter-section">' +
            '<div class="filter-actions">' +
                '<div>' +
                    '<button class="select-all" type="button">Select all</button>' +
                    '<span>•</span>' +
                    '<button class="clear" type="button">Clear</button>' +
                '</div>' +
                '<div class="displaying">Displaying 0</div>' +
            '</div>' +
            '<div class="filter-search">' +
                '<input type="text" placeholder="Search">' +
                '<span>🔍</span>' +
            '</div>' +
            '<div class="filter-values"></div>' +
        '</div>' +
        '<div class="filter-footer">' +
            '<button class="cancel" type="button">Cancel</button>' +
            '<button class="ok" type="button">OK</button>' +
        '</div>' +
    '</div>';
}

function renderSheetTabs(data) {
    if (!data.sheets || data.sheets.length === 0) {
        sheetTabs.innerHTML = '';
        return;
    }
    sheetTabs.innerHTML = data.sheets
        .map((sheet) => {
            const active = sheet.index === data.sheetIndex ? ' active' : '';
            return '<button class="sheet-tab' + active + '" data-index="' + sheet.index + '">' +
                escapeHtml(sheet.name) + '</button>';
        })
        .join('');
}

function updateAggregatesUI(payload) {
    const agg = document.getElementById('agg');
    const sumWrap = document.getElementById('sumWrap');
    const avgWrap = document.getElementById('avgWrap');
    if (payload) {
        agg.style.display = 'block';
        sumWrap.style.display = payload.showStats ? 'inline' : 'none';
        avgWrap.style.display = payload.showStats ? 'inline' : 'none';
        document.getElementById('sVal').innerText = payload.sum;
        document.getElementById('cVal').innerText = payload.count;
        document.getElementById('aVal').innerText = payload.avg;
    } else {
        agg.style.display = 'none';
    }
}
`;
