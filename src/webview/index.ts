/**
 * Webview Module Index
 * Main entry point for the webview HTML generation
 */

import { getAllStyles } from './styles';
import {
    toolbarHtml,
    gridHtml,
    statusBarHtml,
    sheetTabsHtml,
    loadingHtml
} from './template';
import { getAllScripts } from './scripts/index';

/**
 * Generate the complete webview HTML
 */
export function getHtmlShell(): string {
    const styles = getAllStyles();
    const scripts = getAllScripts();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Excel Lite</title>
    <style>
${styles}
    </style>
</head>
<body>
    ${loadingHtml}
    ${toolbarHtml}
    ${gridHtml}
    ${statusBarHtml}
    ${sheetTabsHtml}

    <script>
${scripts}
    </script>
</body>
</html>`;
}

// Re-export for granular access if needed
export * from './styles';
export * from './template';
export { getAllScripts } from './scripts/index';
