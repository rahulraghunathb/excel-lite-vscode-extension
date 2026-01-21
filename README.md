# Excel Lite

Excel Lite is a VS Code extension for viewing and editing Excel/CSV files with spreadsheet-style interactions, filtering, and formatting.

## Author

**Rahul Raghunath Bodanki**
- [GitHub](https://github.com/rahulraghunathb)
- [Portfolio](https://portfolio-website-beta-two-82.vercel.app/)

## Features

### File Support

- Open `.xlsx`, `.xls`, and `.csv` files in a custom editor.
- Rename files directly from the toolbar.
- Rename the active sheet name.

### Editing & Formatting

- Single cell editing (double-click to edit).
- Bold formatting.
- Fill color selection with a **No Color** option.
- Auto save toggle.

### Selection & Aggregates

- Click-and-drag range selection.
- **Shift + click** to extend range selection.
- **Ctrl/Cmd + click** to multi-select individual cells.
- Row header click selects an entire row.
- Column letter header (A, B, C...) click selects an entire column.
- Status bar aggregates:
  - **SUM / AVG** shown for numeric selections.
  - **COUNT** shown for any selection (strings included).

### Sorting & Filtering

- Column header sort.
- Filter popup styled like Excel with:
  - Sort A→Z / Z→A actions.
  - Filter by values list with search.
  - Select all / clear controls.
  - OK / Cancel actions.

### Appearance

- **Dark/Light theme toggle** in the toolbar.
- Theme colors switch instantly in the webview.

## Usage

1. Open a `.csv` or `.xlsx` file.
2. Use the toolbar for formatting, auto save, and theme toggling.
3. Click row/column headers for fast selection.
4. Use the filter icon for sorting and filtering.

## Development

```bash
npm install
npm run watch
```

Press `F5` in VS Code to launch the Extension Development Host.
