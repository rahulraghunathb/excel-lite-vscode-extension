/**
 * Webview State Management
 */

export const stateScript = `
// ============================================
// STATE MANAGEMENT
// ============================================

const vscode = acquireVsCodeApi();

// Grid state
let currentRows = [];
let numCols = 0;

// Selection state
let sR = null;      // Selection range start
let sE = null;      // Selection range end
let isS = false;    // Is selecting
let anchor = null;  // Anchor cell for shift-select
let ranges = [];    // Selected ranges
let activeRangeIndex = -1;

// Resize state
let columnWidths = [];
let rowHeights = [];
let resizing = null;
let resizeStart = 0;
let resizeSize = 0;

// Event binding flag
let eventsBound = false;

// Theme state
const state = vscode.getState() || {};
const initialTheme = state.theme || 'dark';
`;
