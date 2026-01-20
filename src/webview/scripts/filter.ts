/**
 * Filter Logic
 */

export const filterScript = `
// ============================================
// FILTER
// ============================================

function populateFilterValues(popup) {
    const colIndex = parseInt(popup.dataset.col);
    const values = currentRows.map(row => String(row[colIndex] ?? ''));
    const unique = Array.from(new Set(values));
    const list = popup.querySelector('.filter-values');
    const search = popup.querySelector('.filter-search input');
    const displaying = popup.querySelector('.displaying');

    const renderList = (term) => {
        list.innerHTML = '';
        const filtered = unique.filter(v => v.toLowerCase().includes(term.toLowerCase()));
        filtered.forEach(v => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = v;
            checkbox.checked = true;
            const span = document.createElement('span');
            span.innerText = v || '(Blank)';
            label.appendChild(checkbox);
            label.appendChild(span);
            list.appendChild(label);
        });
        displaying.textContent = 'Displaying ' + filtered.length;
    };

    search.oninput = () => renderList(search.value || '');
    renderList('');
}

function closeAllFilterPopups() {
    document.querySelectorAll('.filter-popup').forEach(item => item.classList.remove('show'));
}

function toggleFilterPopup(popup) {
    const shown = popup.classList.contains('show');
    closeAllFilterPopups();
    if (!shown) {
        populateFilterValues(popup);
        popup.classList.add('show');
    }
}
`;
