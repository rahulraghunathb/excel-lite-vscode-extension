/**
 * Selection Logic
 */

export const selectionScript = `
// ============================================
// SELECTION
// ============================================

function updateSelectionUI() {
    if (ranges.length === 0) return;

    document.querySelectorAll('td[data-row]').forEach(td => {
        const r = parseInt(td.dataset.row), c = parseInt(td.dataset.col);
        const selected = ranges.some(range =>
            r >= range.startRow && r <= range.endRow &&
            c >= range.startCol && c <= range.endCol
        );
        td.classList.toggle('selected', selected);
    });

    document.querySelectorAll('td.row-header').forEach(rh => {
        const r = parseInt(rh.dataset.rowIdx);
        const selected = ranges.some(range =>
            r >= range.startRow && r <= range.endRow &&
            range.startCol === 0 && range.endCol === numCols - 1
        );
        rh.classList.toggle('row-selected', selected);
    });

    document.querySelectorAll('th.col-letter, th.header-cell').forEach(th => {
        const c = parseInt(th.dataset.col);
        const selected = ranges.some(range =>
            c >= range.startCol && c <= range.endCol &&
            range.startRow === 0 && range.endRow === currentRows.length - 1
        );
        th.classList.toggle('col-selected', selected);
    });
}

function postSelection() {
    if (ranges.length === 0) return;
    vscode.postMessage({ type: 'selection', payload: { ranges }});
}

function selectAll() {
    isS = false;
    sR = { r: 0, c: 0 };
    sE = { r: currentRows.length - 1, c: numCols - 1 };
    anchor = { r: 0, c: 0 };
    ranges = [{ startRow: 0, startCol: 0, endRow: currentRows.length - 1, endCol: numCols - 1 }];
    updateSelectionUI();
    postSelection();
}

function selectColumn(colIndex) {
    isS = false;
    sR = { r: 0, c: colIndex };
    sE = { r: currentRows.length - 1, c: colIndex };
    anchor = { r: 0, c: colIndex };
    ranges = [{ startRow: 0, startCol: colIndex, endRow: currentRows.length - 1, endCol: colIndex }];
    updateSelectionUI();
    postSelection();
}

function selectRow(rowIndex) {
    isS = false;
    sR = { r: rowIndex, c: 0 };
    sE = { r: rowIndex, c: numCols - 1 };
    anchor = { r: rowIndex, c: 0 };
    ranges = [{ startRow: rowIndex, startCol: 0, endRow: rowIndex, endCol: numCols - 1 }];
    updateSelectionUI();
    postSelection();
}

function selectCell(row, col, shiftKey, ctrlKey) {
    const point = { r: row, c: col };

    if (shiftKey && anchor) {
        isS = false;
        sR = { ...anchor };
        sE = { ...point };
        ranges = [{
            startRow: Math.min(sR.r, sE.r),
            startCol: Math.min(sR.c, sE.c),
            endRow: Math.max(sR.r, sE.r),
            endCol: Math.max(sR.c, sE.c)
        }];
    } else if (ctrlKey) {
        isS = false;
        sR = { ...point };
        sE = { ...point };
        const exists = ranges.some(range =>
            range.startRow === point.r && range.endRow === point.r &&
            range.startCol === point.c && range.endCol === point.c
        );
        ranges = exists
            ? ranges.filter(range => !(
                range.startRow === point.r && range.endRow === point.r &&
                range.startCol === point.c && range.endCol === point.c
            ))
            : [...ranges, { startRow: point.r, startCol: point.c, endRow: point.r, endCol: point.c }];
    } else {
        isS = true;
        sR = { ...point };
        sE = { ...point };
        anchor = { ...point };
        ranges = [{ startRow: point.r, startCol: point.c, endRow: point.r, endCol: point.c }];
        activeRangeIndex = 0;
    }

    updateSelectionUI();
    postSelection();
}

function extendSelection(row, col) {
    sE = { r: row, c: col };
    const updated = {
        startRow: Math.min(sR.r, sE.r),
        startCol: Math.min(sR.c, sE.c),
        endRow: Math.max(sR.r, sE.r),
        endCol: Math.max(sR.c, sE.c)
    };
    if (activeRangeIndex >= 0 && ranges[activeRangeIndex]) {
        ranges[activeRangeIndex] = updated;
    } else {
        ranges = [updated];
    }
    updateSelectionUI();
}
`;
