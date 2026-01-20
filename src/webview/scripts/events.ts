/**
 * Event Handlers
 */

export const eventsScript = `
// ============================================
// EVENT HANDLERS
// ============================================

function attachEvents() {
    // Filter icon clicks
    document.querySelectorAll('.filter-icon').forEach(icon => {
        icon.onclick = (e) => {
            e.stopPropagation();
            const popup = icon.nextElementSibling;
            toggleFilterPopup(popup);
        };
    });

    // Header cell clicks (for sorting)
    document.querySelectorAll('th[data-col]').forEach(th => {
        th.onclick = (e) => {
            if (th.classList.contains('col-letter')) return;
            if (e.target.classList.contains('filter-icon')) return;
            if (e.target.closest('.filter-popup')) return;
            vscode.postMessage({ type: 'sort', payload: { column: parseInt(th.dataset.col) } });
        };
    });

    // Filter popup event delegation
    document.querySelectorAll('.filter-popup').forEach(popup => {
        popup.onclick = (e) => e.stopPropagation();
    });

    // Sort actions
    document.querySelectorAll('.filter-item[data-action="sort-asc"]').forEach(item => {
        item.onclick = () => {
            const p = item.closest('.filter-popup');
            vscode.postMessage({ type: 'sort', payload: { column: parseInt(p.dataset.col), direction: 'asc' } });
            p.classList.remove('show');
        };
    });

    document.querySelectorAll('.filter-item[data-action="sort-desc"]').forEach(item => {
        item.onclick = () => {
            const p = item.closest('.filter-popup');
            vscode.postMessage({ type: 'sort', payload: { column: parseInt(p.dataset.col), direction: 'desc' } });
            p.classList.remove('show');
        };
    });

    // Filter values
    document.querySelectorAll('.filter-item[data-action="filter-values"]').forEach(item => {
        item.onclick = () => {
            const p = item.closest('.filter-popup');
            populateFilterValues(p);
        };
    });

    document.querySelectorAll('.filter-item[data-action="filter-condition"]').forEach(item => {
        item.onclick = () => {
            const p = item.closest('.filter-popup');
            p.classList.add('show');
        };
    });

    // Filter actions
    document.querySelectorAll('.filter-popup .clear').forEach(btn => {
        btn.onclick = () => {
            const p = btn.closest('.filter-popup');
            if (btn.classList.contains('clear') && btn.classList.contains('select-all')) return;
            p.querySelectorAll('.filter-values input[type="checkbox"]').forEach(cb => cb.checked = false);
        };
    });

    document.querySelectorAll('.filter-popup .select-all').forEach(btn => {
        btn.onclick = () => {
            const p = btn.closest('.filter-popup');
            p.querySelectorAll('.filter-values input[type="checkbox"]').forEach(cb => cb.checked = true);
        };
    });

    document.querySelectorAll('.filter-popup .cancel').forEach(btn => {
        btn.onclick = () => {
            const p = btn.closest('.filter-popup');
            p.classList.remove('show');
        };
    });

    document.querySelectorAll('.filter-popup .ok').forEach(btn => {
        btn.onclick = () => {
            const p = btn.closest('.filter-popup');
            const values = Array.from(p.querySelectorAll('.filter-values input[type="checkbox"]'))
                .filter(cb => cb.checked)
                .map(cb => cb.value);
            vscode.postMessage({ type: 'filter', payload: { column: parseInt(p.dataset.col), operator: 'in', value: values }});
            p.classList.remove('show');
        };
    });

    // Sheet tabs
    document.querySelectorAll('.sheet-tab').forEach(tab => {
        tab.onclick = () => vscode.postMessage({ type: 'switchSheet', payload: { index: parseInt(tab.dataset.index) } });
        tab.ondblclick = () => vscode.postMessage({ type: 'renameSheet', payload: { index: parseInt(tab.dataset.index) } });
    });

    // Column resizers
    document.querySelectorAll('.col-resizer').forEach(handle => {
        handle.onmousedown = (e) => startColumnResize(e, handle, parseInt(handle.dataset.col));
    });

    // Row resizers
    document.querySelectorAll('.row-resizer').forEach(handle => {
        handle.onmousedown = (e) => startRowResize(e, handle, parseInt(handle.dataset.row));
    });

    // Global event listeners (only attach once)
    if (!eventsBound) {
        document.addEventListener('click', closeAllFilterPopups);
        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
        eventsBound = true;
    }
}
`;
