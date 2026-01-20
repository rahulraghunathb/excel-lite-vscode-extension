/**
 * Utility Functions
 */

export const utilsScript = `
// ============================================
// UTILITY FUNCTIONS
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getColumnLetter(index) {
    let result = '';
    let n = index;
    while (n >= 0) {
        result = String.fromCharCode((n % 26) + 65) + result;
        n = Math.floor(n / 26) - 1;
    }
    return result;
}

function applyTheme(theme) {
    document.body.dataset.theme = theme;
}
`;
