/**
 * Initialization Script
 */

export const initScript = `
// ============================================
// INITIALIZATION
// ============================================

// Global error handler
window.onerror = function(msg, url, line, col, error) {
    vscode.postMessage({
        type: 'error',
        payload: { message: msg, line: line, col: col, stack: error ? error.stack : '' }
    });
    console.error('Excel Lite Error:', msg, 'at', line, ':', col);
    return false;
};

// Apply initial theme
try {
    applyTheme(initialTheme);
    themeToggle.checked = initialTheme === 'dark';
} catch (e) {
    console.error('Failed to apply theme:', e);
}

// Message handler
window.addEventListener('message', event => {
    try {
        const message = event.data;
        switch (message.type) {
            case 'update':
                renderGrid(message.payload);
                break;
            case 'aggregates':
                updateAggregatesUI(message.payload);
                break;
        }
    } catch (e) {
        console.error('Error handling message:', e);
    }
});

// Toolbar button handlers
try {
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
} catch (e) {
    console.error('Error attaching toolbar events:', e);
}

// Signal ready
vscode.postMessage({ type: 'ready' });

`;
