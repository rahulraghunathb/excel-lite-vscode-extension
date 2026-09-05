import {
  MIN_COL_WIDTH,
  MIN_ROW_HEIGHT,
  persist,
  persisted,
  saveColumnWidths,
  state,
  vscode,
} from "./state"
import {
  dom,
  ensureWindow,
  renderBody,
  renderHeaders,
  renderRowCount,
  renderSheetTabs,
  setUniformRowHeight,
  uniformRowHeight,
} from "./render"
import {
  clearSelection,
  extendSelection,
  moveCursor,
  postSelection,
  scrollRowIntoView,
  selectAll,
  selectCell,
  selectColumn,
  selectRow,
} from "./selection"
import {
  closeFilterPopup,
  handleGlobalScroll,
  openFilterPopup,
  showFilterPopup,
} from "./filterPopup"
import type {
  AggregatesPayload,
  EditValuePayload,
  FilterOptionsPayload,
  InitPayload,
  WindowPayload,
} from "./protocol"

// ------------------------------------------------------------------- messaging

window.addEventListener("message", (event) => {
  const message = event.data as { type: string; payload?: unknown }
  try {
    switch (message.type) {
      case "init":
        handleInit(message.payload as InitPayload)
        break
      case "window":
        handleWindow(message.payload as WindowPayload)
        break
      case "aggregates":
        handleAggregates(message.payload as AggregatesPayload | null)
        break
      case "filterOptions":
        showFilterPopup(message.payload as FilterOptionsPayload)
        break
      case "editValue":
        beginEdit(message.payload as EditValuePayload)
        break
    }
  } catch (error) {
    vscode.postMessage({
      type: "error",
      payload: { message: String(error), stack: (error as Error)?.stack },
    })
  }
})

function handleInit(payload: InitPayload) {
  const columnsChanged =
    payload.headers.length !== state.headers.length ||
    payload.headers.some((header, i) => header !== state.headers[i])

  state.headers = payload.headers
  state.totalRows = payload.totalRows
  state.rowVersion = payload.rowVersion
  state.sheetIndex = payload.sheetIndex
  state.sort = payload.sort
  state.activeFilters = new Set(payload.activeFilters)

  // Drop any selection that no longer exists after a filter or sheet change.
  state.ranges = state.ranges
    .map((range) => ({
      ...range,
      startRow: Math.min(range.startRow, Math.max(0, payload.totalRows - 1)),
      endRow: Math.min(range.endRow, Math.max(0, payload.totalRows - 1)),
    }))
    .filter(() => payload.totalRows > 0)
  if (state.cursor && state.cursor.r >= payload.totalRows) {
    state.cursor = payload.totalRows > 0 ? { r: payload.totalRows - 1, c: state.cursor.c } : null
  }

  dom.loading.classList.add("hidden")
  dom.sheetName.textContent = payload.sheetName
  renderSheetTabs(payload.sheets, payload.sheetIndex)
  renderRowCount(payload.totalRows, payload.unfilteredRows)
  ;(document.getElementById("autoSaveToggle") as HTMLInputElement).checked =
    payload.isAutoSaveEnabled

  void columnsChanged
  renderHeaders()
  ensureWindow(true)
}

function handleWindow(payload: WindowPayload) {
  // Ignore a window computed against data we have already moved past.
  if (payload.rowVersion !== state.rowVersion) return
  state.pendingWindow = null
  state.windowStart = payload.start
  state.windowRows = payload.rows
  state.windowStyles = payload.styles
  state.windowOriginalIndices = payload.originalIndices
  state.windowVersion = payload.rowVersion
  renderBody()
}

function handleAggregates(payload: AggregatesPayload | null) {
  if (!payload) {
    dom.agg.classList.add("hidden")
    dom.selInfo.textContent = "Click to select · double-click or F2 to edit"
    return
  }
  dom.agg.classList.remove("hidden")
  const stats: string[] = [`COUNT ${payload.count}`]
  if (payload.numericCount > 0) {
    stats.unshift(`SUM ${payload.sum}`, `AVG ${payload.avg}`)
    stats.push(`MIN ${payload.min}`, `MAX ${payload.max}`)
  }
  dom.agg.textContent = stats.join("   ·   ")

  const cells = state.ranges.reduce(
    (total, range) =>
      total +
      (Math.abs(range.endRow - range.startRow) + 1) *
        (Math.abs(range.endCol - range.startCol) + 1),
    0,
  )
  dom.selInfo.textContent = `${cells.toLocaleString()} cell${cells === 1 ? "" : "s"} selected`
}

// -------------------------------------------------------------------- editing

let editor: HTMLInputElement | null = null

function requestEdit(row: number, col: number, seed?: string) {
  if (editor) commitEdit()
  state.editing = { row, col }
  pendingSeed = seed
  vscode.postMessage({ type: "requestEditValue", payload: { row, col } })
}

let pendingSeed: string | undefined

function beginEdit(payload: EditValuePayload) {
  if (
    !state.editing ||
    state.editing.row !== payload.row ||
    state.editing.col !== payload.col
  ) {
    return
  }

  const cell = dom.body.querySelector<HTMLElement>(
    `td.cell[data-row="${payload.row}"][data-col="${payload.col}"]`,
  )
  if (!cell) {
    state.editing = null
    return
  }

  const rect = cell.getBoundingClientRect()
  const input = document.createElement("input")
  input.className = "edit-input"
  input.value = pendingSeed ?? payload.text
  input.style.top = `${rect.top}px`
  input.style.left = `${rect.left}px`
  input.style.width = `${rect.width}px`
  input.style.height = `${rect.height}px`
  document.body.appendChild(input)
  input.focus()
  if (pendingSeed === undefined) input.select()
  else input.setSelectionRange(input.value.length, input.value.length)
  pendingSeed = undefined
  editor = input

  input.onblur = () => commitEdit()
  input.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      commitEdit()
      moveCursor(event.shiftKey ? -1 : 1, 0)
    } else if (event.key === "Tab") {
      event.preventDefault()
      commitEdit()
      moveCursor(0, event.shiftKey ? -1 : 1)
    } else if (event.key === "Escape") {
      event.preventDefault()
      cancelEdit()
    }
    event.stopPropagation()
  }
}

function commitEdit() {
  if (!editor || !state.editing) return
  const { row, col } = state.editing
  const value = editor.value
  editor.onblur = null
  editor.remove()
  editor = null
  state.editing = null
  vscode.postMessage({ type: "edit", payload: { row, col, value } })
}

function cancelEdit() {
  if (!editor) return
  editor.onblur = null
  editor.remove()
  editor = null
  state.editing = null
  dom.grid.focus()
}

/** Clear every selected cell (Delete / Backspace). */
function clearSelectedCells() {
  if (state.ranges.length === 0) return
  vscode.postMessage({ type: "clipboard", payload: { action: "clear" } })
}

// --------------------------------------------------------------------- resize

function beginResize(event: MouseEvent, handle: HTMLElement) {
  const colAttr = handle.dataset.col
  if (colAttr !== undefined) {
    const col = Number(colAttr)
    const th = dom.colLetters.querySelector<HTMLElement>(`th[data-col="${col}"]`)
    state.resizing = {
      type: "col",
      index: col,
      start: event.clientX,
      size: th?.offsetWidth ?? 120,
      handle,
    }
  } else {
    state.resizing = {
      type: "row",
      index: -1,
      start: event.clientY,
      size: uniformRowHeight,
      handle,
    }
  }
  handle.classList.add("active")
  document.body.style.cursor = state.resizing.type === "col" ? "col-resize" : "row-resize"
  event.preventDefault()
  event.stopPropagation()
}

function handleResizeMove(event: MouseEvent) {
  const resizing = state.resizing
  if (!resizing) return
  event.preventDefault()

  if (resizing.type === "col") {
    const next = Math.max(MIN_COL_WIDTH, resizing.size + (event.clientX - resizing.start))
    state.columnWidths.set(resizing.index, Math.round(next))
    applyColumnWidth(resizing.index)
  } else {
    // Row height is uniform: with virtualised scrolling every row must be the
    // same height for scroll offsets to stay exact.
    const next = Math.max(MIN_ROW_HEIGHT, resizing.size + (event.clientY - resizing.start))
    setUniformRowHeight(Math.round(next))
    renderBody()
  }
}

function applyColumnWidth(col: number) {
  const width = state.columnWidths.get(col) ?? 120
  const css = `${width}px`
  document
    .querySelectorAll<HTMLElement>(`th[data-col="${col}"], td[data-col="${col}"]`)
    .forEach((element) => {
      element.style.width = css
      element.style.minWidth = css
      element.style.maxWidth = css
    })
}

function endResize() {
  if (!state.resizing) return
  state.resizing.handle.classList.remove("active")
  document.body.style.cursor = ""
  const wasColumn = state.resizing.type === "col"
  state.resizing = null
  if (wasColumn) saveColumnWidths()
  else ensureWindow(true)
}

// --------------------------------------------------------------------- events

dom.grid.addEventListener("mousedown", (event) => {
  const target = event.target as HTMLElement
  if (target.closest(".col-resizer, .row-resizer")) {
    beginResize(event, target.closest(".col-resizer, .row-resizer") as HTMLElement)
    return
  }
  if (target.closest(".filter-icon")) return

  closeFilterPopup()
  event.preventDefault()
  dom.grid.focus()

  if (target.closest("#selectAll") || target.closest("th.corner")) {
    selectAll()
    return
  }

  const cell = target.closest<HTMLElement>("td.cell")
  if (cell) {
    state.isDragging = true
    selectCell(
      Number(cell.dataset.row),
      Number(cell.dataset.col),
      event.shiftKey,
      event.ctrlKey || event.metaKey,
    )
    return
  }

  const rowHeader = target.closest<HTMLElement>("td.row-header")
  if (rowHeader) {
    selectRow(Number(rowHeader.dataset.row))
    return
  }

  const header = target.closest<HTMLElement>("th[data-col]")
  if (header) selectColumn(Number(header.dataset.col))
})

dom.grid.addEventListener("mousemove", (event) => {
  if (!state.isDragging) return
  const cell = (event.target as HTMLElement).closest<HTMLElement>("td.cell")
  if (cell) extendSelection(Number(cell.dataset.row), Number(cell.dataset.col))
})

document.addEventListener("mouseup", () => {
  if (state.isDragging) {
    state.isDragging = false
    postSelection()
  }
  endResize()
})

document.addEventListener("mousemove", handleResizeMove)

dom.grid.addEventListener("dblclick", (event) => {
  const cell = (event.target as HTMLElement).closest<HTMLElement>("td.cell")
  if (!cell) return
  requestEdit(Number(cell.dataset.row), Number(cell.dataset.col))
})

// Sorting from a header click, and opening the filter menu.
document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement

  const filterIcon = target.closest<HTMLElement>(".filter-icon")
  if (filterIcon) {
    event.stopPropagation()
    openFilterPopup(Number(filterIcon.dataset.col), filterIcon)
    return
  }

  const headerText = target.closest<HTMLElement>(".header-text")
  if (headerText) {
    const th = headerText.closest<HTMLElement>("th[data-col]")
    if (th) vscode.postMessage({ type: "sort", payload: { column: Number(th.dataset.col) } })
    return
  }

  const tab = target.closest<HTMLElement>(".sheet-tab")
  if (tab) {
    vscode.postMessage({
      type: "switchSheet",
      payload: { index: Number(tab.dataset.index) },
    })
    return
  }

  if (!target.closest(".filter-popup")) closeFilterPopup()
})

dom.sheetTabs.addEventListener("dblclick", (event) => {
  const tab = (event.target as HTMLElement).closest<HTMLElement>(".sheet-tab")
  if (tab) {
    vscode.postMessage({
      type: "renameSheet",
      payload: { index: Number(tab.dataset.index) },
    })
  }
})

let scrollScheduled = false

/**
 * Coalesce scroll events into one window fetch per frame.
 *
 * A plain requestAnimationFrame latch wedges permanently if frames stop being
 * produced (a hidden or throttled webview), which would silently freeze the
 * grid, so a timer races the frame and whichever lands first wins.
 */
function scheduleWindowFetch() {
  if (scrollScheduled) return
  scrollScheduled = true
  const run = () => {
    if (!scrollScheduled) return
    scrollScheduled = false
    ensureWindow()
  }
  requestAnimationFrame(run)
  setTimeout(run, 100)
}

dom.grid.addEventListener("scroll", () => {
  handleGlobalScroll()
  scheduleWindowFetch()
})

window.addEventListener("resize", () => scheduleWindowFetch())

// ------------------------------------------------------------------- keyboard

document.addEventListener("keydown", (event) => {
  if (editor) return
  const target = event.target as HTMLElement
  if (target.tagName === "INPUT" || target.tagName === "SELECT") return

  const ctrl = event.ctrlKey || event.metaKey

  if (ctrl) {
    switch (event.key.toLowerCase()) {
      case "c":
        vscode.postMessage({ type: "clipboard", payload: { action: "copy" } })
        return
      case "x":
        vscode.postMessage({ type: "clipboard", payload: { action: "cut" } })
        return
      case "v":
        vscode.postMessage({ type: "clipboard", payload: { action: "paste" } })
        return
      case "z":
        event.preventDefault()
        vscode.postMessage({ type: event.shiftKey ? "redo" : "undo" })
        return
      case "y":
        event.preventDefault()
        vscode.postMessage({ type: "redo" })
        return
      case "s":
        event.preventDefault()
        vscode.postMessage({ type: "save" })
        return
      case "a":
        event.preventDefault()
        selectAll()
        return
      case "home":
        event.preventDefault()
        selectCell(0, 0)
        dom.grid.scrollTop = 0
        return
      case "end":
        event.preventDefault()
        selectCell(state.totalRows - 1, state.headers.length - 1)
        scrollRowIntoView(state.totalRows - 1)
        return
    }
  }

  const pageRows = Math.max(1, Math.floor(dom.grid.clientHeight / uniformRowHeight) - 1)

  switch (event.key) {
    case "ArrowUp":
      event.preventDefault()
      moveCursor(-1, 0, event.shiftKey)
      break
    case "ArrowDown":
      event.preventDefault()
      moveCursor(1, 0, event.shiftKey)
      break
    case "ArrowLeft":
      event.preventDefault()
      moveCursor(0, -1, event.shiftKey)
      break
    case "ArrowRight":
      event.preventDefault()
      moveCursor(0, 1, event.shiftKey)
      break
    case "PageUp":
      event.preventDefault()
      moveCursor(-pageRows, 0, event.shiftKey)
      break
    case "PageDown":
      event.preventDefault()
      moveCursor(pageRows, 0, event.shiftKey)
      break
    case "Home":
      event.preventDefault()
      moveCursor(0, -state.headers.length, event.shiftKey)
      break
    case "End":
      event.preventDefault()
      moveCursor(0, state.headers.length, event.shiftKey)
      break
    case "Tab":
      event.preventDefault()
      moveCursor(0, event.shiftKey ? -1 : 1)
      break
    case "Enter":
    case "F2":
      event.preventDefault()
      if (state.cursor) requestEdit(state.cursor.r, state.cursor.c)
      break
    case "Delete":
    case "Backspace":
      event.preventDefault()
      clearSelectedCells()
      break
    case "Escape":
      clearSelection()
      closeFilterPopup()
      break
    default:
      // Typing over a selected cell replaces its contents, as in Excel.
      if (!ctrl && !event.altKey && event.key.length === 1 && state.cursor) {
        event.preventDefault()
        requestEdit(state.cursor.r, state.cursor.c, event.key)
      }
  }
})

// -------------------------------------------------------------------- toolbar

function bind(id: string, handler: (element: HTMLElement) => void) {
  const element = document.getElementById(id)
  if (element) element.onclick = () => handler(element)
}

bind("boldBtn", () => vscode.postMessage({ type: "style", payload: { type: "bold" } }))
bind("fillBtn", () =>
  vscode.postMessage({
    type: "style",
    payload: {
      type: "fill",
      color: (document.getElementById("fillColor") as HTMLInputElement).value,
    },
  }),
)
bind("noFillBtn", () =>
  vscode.postMessage({ type: "style", payload: { type: "clearFill" } }),
)
bind("renameFileBtn", () => vscode.postMessage({ type: "renameFile" }))
bind("renameSheetBtn", () => vscode.postMessage({ type: "renameSheet" }))
bind("saveBtn", () => vscode.postMessage({ type: "save" }))

const autoSave = document.getElementById("autoSaveToggle") as HTMLInputElement
autoSave.onchange = () =>
  vscode.postMessage({ type: "autoSaveToggle", payload: autoSave.checked })

const themeToggle = document.getElementById("themeToggle") as HTMLInputElement

/**
 * Default to the VS Code theme; the toggle is an explicit override that
 * persists across reloads of this panel.
 */
function applyTheme(theme: "dark" | "light" | "auto") {
  if (theme === "auto") delete document.body.dataset.theme
  else document.body.dataset.theme = theme
  persisted.theme = theme
  persist()
}

themeToggle.onchange = () => applyTheme(themeToggle.checked ? "dark" : "light")
applyTheme(persisted.theme ?? "auto")
themeToggle.checked =
  (persisted.theme ?? "auto") === "auto"
    ? document.body.classList.contains("vscode-dark") ||
      document.body.classList.contains("vscode-high-contrast")
    : persisted.theme === "dark"

window.onerror = (message, _source, line, col, error) => {
  vscode.postMessage({
    type: "error",
    payload: { message: String(message), line, col, stack: error?.stack },
  })
  return false
}

dom.grid.tabIndex = 0
vscode.postMessage({ type: "ready" })
