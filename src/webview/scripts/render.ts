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

    // Render Column Letters
    let lettersHtml = '<th style="width:50px; min-width:50px; max-width:50px;"></th>';
    for (let i = 0; i < numCols; i++) {
        const w = columnWidths[i];
        const style = w ? 'style="width:' + w + 'px; min-width:' + w + 'px; max-width:' + w + 'px;"' : '';
        lettersHtml += '<th class="col-letter" data-col="' + i + '" ' + style + '>' +
            getColumnLetter(i) + '<div class="col-resizer" data-col="' + i + '"></div></th>';
    }
    colLetters.innerHTML = lettersHtml;

    // Render Headers
    let hHtml = '<th id="selectAll" style="width:50px; min-width:50px; max-width:50px;">#</th>';
    data.headers.forEach((h, i) => {
        const w = columnWidths[i];
        const style = w ? 'style="width:' + w + 'px; min-width:' + w + 'px; max-width:' + w + 'px;"' : '';
        hHtml += '<th class="header-cell" data-col="' + i + '" ' + style + '>' +
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
        const rh = rowHeights[dIdx];
        const rowStyle = rh ? 'style="height:' + rh + 'px;"' : '';

        bHtml += '<tr ' + rowStyle + '><td class="row-header" data-row-idx="' + dIdx + '">' +
            (oIdx + 1) + '<div class="row-resizer" data-row="' + dIdx + '"></div></td>';

        row.forEach((cell, cIdx) => {
            const style = data.styles[oIdx + ',' + cIdx] || {};
            const cw = columnWidths[cIdx];

            let cellStyles = [];
            if (style.bold) cellStyles.push('font-weight:bold');
            if (style.bgColor) cellStyles.push('background-color:' + style.bgColor);
            if (rh) cellStyles.push('height:' + rh + 'px');
            if (cw) {
                cellStyles.push('width:' + cw + 'px');
                cellStyles.push('min-width:' + cw + 'px');
                cellStyles.push('max-width:' + cw + 'px');
            }

            const styleAttr = cellStyles.length > 0 ? 'style="' + cellStyles.join(';') + '"' : '';
            bHtml += '<td data-row="' + dIdx + '" data-col="' + cIdx + '" ' + styleAttr + '>' +
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
