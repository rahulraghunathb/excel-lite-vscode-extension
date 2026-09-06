# Changelog

All notable changes to Excel Lite are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.1.0 — 2026-09-06

### Added

- **Insert and delete rows and columns**, from the right-click menu on a row
  number or column header. Selecting whole rows or columns first acts on all of
  them. Fully undoable, including the formatting of deleted cells.
- **Find and replace** (`Ctrl+F`) with match-case, whole-cell matching, `F3` to
  step through matches, and replace-all as a single undo step. Matching runs
  against the text the cell editor shows, so a formula matches on its expression
  and a replacement round-trips back into a formula.
- **Formula bar** showing the selected cell's reference and true contents, and
  committing on `Enter`. The reference tracks the underlying sheet row, so it
  stays correct while sorted.
- **Italic, underline, text colour and horizontal alignment**, joining bold and
  fill, all round-tripping into the file.
- Undo and redo buttons in the toolbar.
- Right-click menus on cells, row headers and column headers.

### Changed

- Reworked the toolbar into labelled groups with real icons, split colour
  buttons (one click applies, the chevron picks), and an overflow menu for the
  rename actions, so it no longer overflows in a narrow editor.
- Cells with a light fill now pick a contrasting text colour automatically,
  instead of rendering the theme's light-grey text on pale yellow.
- The sheet name moves to the status bar when a workbook has only one sheet,
  rather than being shown twice.

### Fixed

- Right-clicking a column header while a row was selected offered to insert as
  many columns as the sheet was wide.
- Find highlights could reappear after the panel was closed.
- Scrolling could stop updating the grid if the browser dropped a frame.
- A wide paste could exceed the JavaScript argument limit and throw.

## 2.0.0 — 2026-09-05

A rewrite of the editor core, focused on not losing data.

### Fixed — data loss

- **Saving no longer destroys other worksheets.** Saves now patch the original
  file instead of rebuilding it, so other sheets, formulas, merged cells, frozen
  panes, number formats, column widths, charts and images all survive.
- **Blank rows are preserved** rather than silently deleted.
- **Cell formatting stays on its own row.** A blank row used to desynchronise
  style keys, so formatting landed on the wrong row or vanished.
- **Formulas are preserved** instead of being frozen into static values.
- **Dates stay dates**, displayed as `YYYY-MM-DD`, instead of becoming text.
- **Typed values keep their type** — `42` is saved as a number, `=A1+B1` as a
  formula, and identifiers like `007` stay text.
- **Header formatting is no longer overwritten** with a hardcoded blue fill.
- **Closing a tab no longer discards edits without warning.** The editor is now a
  full `CustomEditorProvider`: dirty indicator, working `Ctrl+S`, native
  undo/redo, hot exit, revert, and a prompt before overwriting a file that
  changed on disk.
- CSV files keep their delimiter, line endings, BOM and blank lines.

### Fixed — correctness

- Filtering a date column returned no rows; filtering a column containing `0`
  dropped those rows.
- Dates sorted alphabetically rather than chronologically.
- Undo after a cut did nothing.
- "Save Changes" could target a different file than the visible one.
- Pasting from Excel did nothing unless you had first copied inside the editor,
  and pasting past the last row silently truncated instead of growing the sheet.
- Aggregates went stale after clearing the selection; the selection highlight was
  wiped after every edit.
- The "sort by colour", "filter by colour" and "filter by condition" menu items
  did nothing. All three now work.
- The filter value list is built from every row, so a value you filter out can
  still be selected again.

### Security

- A crafted `.xlsx` could inject markup into the webview through an unvalidated
  fill colour. Colours are now hex-validated, and the webview has a
  Content-Security-Policy with a per-load nonce.

### Performance

- The grid is virtualised and rows are streamed a window at a time, so large
  sheets no longer freeze the editor.
- Undo history is patch-based rather than cloning the whole sheet per step.
- The extension activates on demand instead of at every VS Code startup.

### Changed

- **Legacy `.xls` is now refused with a clear message.** The underlying library
  has no reader for that format, so the previous claim of support could never
  have worked.
- Row resize applies a uniform height. Per-row heights cannot be exact under
  virtualised scrolling, and the previous behaviour applied them to the wrong
  row after sorting.
- Added `.xlsm` and `.tsv` support.

## 1.0.2 — 2026-01-21

- Updated the extension icon.

## 1.0.1 — 2026-01-21

- Packaging and documentation updates.

## 1.0.0

- Initial release: view and edit Excel/CSV files with sorting, filtering and
  basic formatting.
