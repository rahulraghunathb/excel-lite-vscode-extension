/**
 * Resize Logic
 */

export const resizeScript = `
// ============================================
// RESIZE
// ============================================

function applyColumnWidths() {
    document.querySelectorAll('th[data-col]').forEach(th => {
        const c = parseInt(th.dataset.col);
        if (columnWidths[c]) {
            th.style.width = columnWidths[c] + 'px';
        }
    });
}

function applyRowHeights() {
    document.querySelectorAll('tbody tr').forEach(tr => {
        const rowHeader = tr.querySelector('.row-header');
        if (!rowHeader) return;
        const r = parseInt(rowHeader.dataset.rowIdx);
        const h = rowHeights[r] || DEFAULT_ROW_HEIGHT;
        tr.querySelectorAll('td').forEach(td => {
            td.style.height = h + 'px';
        });
    });
}

function startColumnResize(e, handle, colIndex) {
    e.preventDefault();
    e.stopPropagation();
    resizing = { type: 'col', index: colIndex, handle: handle };
    resizeStart = e.clientX;
    resizeSize = columnWidths[colIndex] || DEFAULT_COL_WIDTH;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
}

function startRowResize(e, handle, rowIndex) {
    e.preventDefault();
    e.stopPropagation();
    resizing = { type: 'row', index: rowIndex, handle: handle };
    resizeStart = e.clientY;
    resizeSize = rowHeights[rowIndex] || DEFAULT_ROW_HEIGHT;
    handle.classList.add('active');
    document.body.style.cursor = 'row-resize';
}

function handleResizeMove(e) {
    if (!resizing) return;
    e.preventDefault();

    if (resizing.type === 'col') {
        const delta = e.clientX - resizeStart;
        const next = Math.max(MIN_COL_WIDTH, resizeSize + delta);
        columnWidths[resizing.index] = next;
        applyColumnWidths();
    } else {
        const delta = e.clientY - resizeStart;
        const next = Math.max(MIN_ROW_HEIGHT, resizeSize + delta);
        rowHeights[resizing.index] = next;
        applyRowHeights();
    }
}

function handleResizeEnd() {
    if (resizing) {
        if (resizing.handle) resizing.handle.classList.remove('active');
        document.body.style.cursor = '';
    }
    resizing = null;
}
`;
