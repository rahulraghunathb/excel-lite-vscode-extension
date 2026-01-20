/**
 * Resize Logic
 */

export const resizeScript = `
// ============================================
// RESIZE
// ============================================

function applyColumnWidths() {
    for (let i = 0; i < numCols; i++) {
        const w = columnWidths[i] || DEFAULT_COL_WIDTH;
        document.querySelectorAll('th[data-col="' + i + '"]').forEach(th => {
            th.style.width = w + 'px';
            th.style.minWidth = w + 'px';
            th.style.maxWidth = w + 'px';
        });
        // Also update data cells to ensure consistency
        document.querySelectorAll('td[data-col="' + i + '"]').forEach(td => {
            td.style.width = w + 'px';
            td.style.minWidth = w + 'px';
            td.style.maxWidth = w + 'px';
        });
    }
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

    // Use actual offsetWidth for initial size calculation
    const th = document.querySelector('th.col-letter[data-col="' + colIndex + '"]');
    resizeSize = th ? th.offsetWidth : (columnWidths[colIndex] || DEFAULT_COL_WIDTH);

    resizing = { type: 'col', index: colIndex, handle: handle };
    resizeStart = e.clientX;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
}

function startRowResize(e, handle, rowIndex) {
    e.preventDefault();
    e.stopPropagation();

    // Use actual offsetHeight for initial size
    const tr = handle.closest('tr');
    resizeSize = tr ? tr.offsetHeight : (rowHeights[rowIndex] || DEFAULT_ROW_HEIGHT);

    resizing = { type: 'row', index: rowIndex, handle: handle };
    resizeStart = e.clientY;
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
