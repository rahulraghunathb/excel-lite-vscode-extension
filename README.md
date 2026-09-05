# Excel Lite

View and edit Excel and CSV files directly in VS Code, with sorting, filtering and
formatting — and **without rewriting the parts of your workbook you didn't touch**.

## Author

**Rahul Raghunath Bodanki**

- [GitHub](https://github.com/rahulraghunathb)
- [Portfolio](https://portfolio-website-beta-two-82.vercel.app/)

## Features

### Files

- Opens `.xlsx`, `.xlsm`, `.csv` and `.tsv` in a custom editor.
- Multi-sheet workbooks, with tabs along the bottom.
- Rename the file or the active sheet from the toolbar.

### Non-destructive saving

Saving patches the original file instead of rebuilding it. Everything Excel Lite
does not model is left exactly as it was:

- other worksheets, formulas, merged cells, frozen panes;
- number formats, column widths, borders, conditional formatting, charts, images.

CSV files keep their delimiter, line endings, BOM and blank lines, so a one-cell
edit shows up in git as a one-line diff.

### Editing

- Double-click, `F2`, `Enter`, or just start typing to edit a cell.
- Values keep their type: `42` is a number, `2026-01-15` is a date, `=A1+B1` is a
  formula, and identifiers such as `007` stay text.
- Full keyboard navigation: arrows, `Tab`, `Enter`, `Page Up/Down`, `Home`/`End`,
  `Ctrl+A`, `Delete` to clear.
- Copy, cut and paste (`Ctrl+C` / `X` / `V`) interoperate with Excel and Sheets,
  including multi-line quoted cells. Pasting past the last row grows the sheet.
- `Ctrl+Z` / `Ctrl+Y` use VS Code's own undo stack.
- Bold and fill colour, applied across the whole selection.

### Saving and safety

- The tab shows a dirty indicator; `Ctrl+S` saves; closing with unsaved changes
  prompts, and unsaved work survives a restart (hot exit).
- If the file changed on disk since you opened it, saving asks before overwriting.
- A clean file that changes on disk reloads automatically.
- Optional **Auto Save** toggle in the toolbar.

### Selection and aggregates

- Drag to select, `Shift+click` to extend, `Ctrl/Cmd+click` for multiple ranges.
- Click a row number or column letter to select the whole row or column.
- The status bar shows SUM, AVG, MIN, MAX and COUNT for the selection.

### Sorting and filtering

- Click a header to cycle ascending → descending → unsorted.
- The filter menu offers three modes:
  - **By value** — searchable checklist of every distinct value in the column.
  - **By condition** — contains, starts/ends with, is empty, `>`, `>=`, `<`, `<=`,
    between, and their negations.
  - **By colour** — filter or sort by fill colour.
- Sorting is type-aware: numbers sort numerically, dates chronologically, blanks last.

### Performance

The grid is virtualised — only the rows on screen exist in the DOM, and the
extension streams a window of rows at a time. Sheets with hundreds of thousands
of rows scroll smoothly.

## Usage

1. Open a `.xlsx`, `.xlsm`, `.csv` or `.tsv` file — Excel Lite is the default editor.
   To go back to the raw text, right-click the file and choose **Open With…**.
2. Edit, format, sort and filter, then `Ctrl+S`.

## Not supported

- **Legacy `.xls`** (the pre-2007 binary format). Open it in Excel or LibreOffice
  and re-save as `.xlsx`.
- Formulas are preserved but not recalculated: editing a cell does not update
  formulas that depend on it until the file is reopened in Excel.
- Inserting or deleting rows and columns.

## Development

```bash
npm install
npm run watch
```

Press `F5` in VS Code to launch the Extension Development Host.

```bash
npm test        # 94 unit, round-trip and end-to-end tests
npm run lint
npm run typecheck
```

See [BUILD.md](BUILD.md) for packaging instructions.
