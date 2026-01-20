/**
 * Grid Mouse/Keyboard Events
 */

export const gridEventsScript = `
// ============================================
// GRID EVENTS
// ============================================

grid.onmousedown = e => {
    if (!e.target.closest('input, textarea')) {
        e.preventDefault();
    }

    const td = e.target.closest('td[data-row]');
    if (e.target.closest('.col-resizer') || e.target.closest('.row-resizer')) return;

    const th = e.target.closest('th[data-col]');
    const rh = e.target.closest('.row-header');
    const selectAllCell = e.target.closest('#selectAll');

    // Select All - click on # corner cell or top-left corner
    const isCornerCell = selectAllCell || (e.target.closest('th') && !e.target.closest('th').dataset.col && e.target.closest('thead tr:first-child'));
    if (isCornerCell) {
        selectAll();
        return;
    }

    if (td) {
        selectCell(
            parseInt(td.dataset.row),
            parseInt(td.dataset.col),
            e.shiftKey,
            e.ctrlKey || e.metaKey
        );
    } else if (th) {
        if (!th.classList.contains('col-letter')) return;
        if (e.target.classList.contains('filter-icon')) return;
        selectColumn(parseInt(th.dataset.col));
    } else if (rh) {
        selectRow(parseInt(rh.dataset.rowIdx));
    }
};

grid.onmousemove = e => {
    if (isS) {
        const td = e.target.closest('td[data-row]');
        if (td) {
            extendSelection(parseInt(td.dataset.row), parseInt(td.dataset.col));
        }
    }
};

grid.addEventListener('selectstart', (e) => {
    if (!e.target.closest('input, textarea')) {
        e.preventDefault();
    }
});

document.onmouseup = () => {
    if (isS) {
        isS = false;
        postSelection();
    }
};

// Double-click to edit
grid.ondblclick = e => {
    const td = e.target.closest('td[data-row]');
    if (!td) return;

    const rect = td.getBoundingClientRect();
    const input = document.createElement('input');
    input.className = 'edit-input';
    input.value = td.textContent;
    input.style.top = (rect.top + window.scrollY) + 'px';
    input.style.left = (rect.left + window.scrollX) + 'px';
    input.style.width = rect.width + 'px';
    input.style.height = rect.height + 'px';

    document.body.appendChild(input);
    input.focus();
    input.select();

    const finish = () => {
        if (input.parentNode) {
            vscode.postMessage({ type: 'edit', payload: {
                row: parseInt(td.dataset.row),
                col: parseInt(td.dataset.col),
                value: input.value
            }});
            document.body.removeChild(input);
        }
    };

    input.onblur = finish;
    input.onkeydown = env => {
        if (env.key === 'Enter') finish();
        if (env.key === 'Escape') document.body.removeChild(input);
    };
};

// Keyboard shortcuts
document.onkeydown = e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c') vscode.postMessage({ type: 'clipboard', payload: { action: 'copy' } });
        else if (e.key === 'x') vscode.postMessage({ type: 'clipboard', payload: { action: 'cut' } });
        else if (e.key === 'v') vscode.postMessage({ type: 'clipboard', payload: { action: 'paste' } });
        else if (e.key === 'z') {
            e.preventDefault();
            vscode.postMessage({ type: 'undo' });
        }
    }
};
`;
