/**
 * Initialization Script
 */

export const initScript = `
// ============================================
// INITIALIZATION
// ============================================

// Apply initial theme
applyTheme(initialTheme);
themeToggle.checked = initialTheme === 'dark';

// Message handler
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'update':
            renderGrid(message.payload);
            break;
        case 'aggregates':
            updateAggregatesUI(message.payload);
            break;
    }
});

// Toolbar button handlers
document.getElementById('boldBtn').onclick = () =>
    vscode.postMessage({ type: 'style', payload: { type: 'bold' } });

document.getElementById('fillBtn').onclick = () =>
    vscode.postMessage({ type: 'style', payload: { type: 'fill', color: document.getElementById('fillColor').value } });

document.getElementById('noFillBtn').onclick = () =>
    vscode.postMessage({ type: 'style', payload: { type: 'clearFill' } });

document.getElementById('renameFileBtn').onclick = () =>
    vscode.postMessage({ type: 'renameFile' });

document.getElementById('renameSheetBtn').onclick = () =>
    vscode.postMessage({ type: 'renameSheet' });

document.getElementById('autoSaveToggle').onchange = (e) =>
    vscode.postMessage({ type: 'autoSaveToggle', payload: e.target.checked });

themeToggle.onchange = () => {
    const theme = themeToggle.checked ? 'dark' : 'light';
    applyTheme(theme);
    vscode.setState({ ...state, theme });
};

// Signal ready
vscode.postMessage({ type: 'ready' });
`;
