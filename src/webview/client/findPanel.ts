import { state, vscode } from "./state"
import { dom, refreshSelectionClasses } from "./render"
import { selectCell, scrollRowIntoView } from "./selection"
import type { FindResultsPayload, Match } from "./protocol"

const panel = document.getElementById("findPanel") as HTMLDivElement
const findInput = document.getElementById("findInput") as HTMLInputElement
const replaceInput = document.getElementById("replaceInput") as HTMLInputElement
const matchCase = document.getElementById("matchCase") as HTMLButtonElement
const wholeCell = document.getElementById("wholeCell") as HTMLButtonElement
const countLabel = document.getElementById("findCount") as HTMLSpanElement

let searchTimer: ReturnType<typeof setTimeout> | undefined
let matches: Match[] = []
let current = -1
let truncated = false

const isPressed = (button: HTMLButtonElement) =>
  button.getAttribute("aria-pressed") === "true"

function options() {
  return {
    query: findInput.value,
    matchCase: isPressed(matchCase),
    wholeCell: isPressed(wholeCell),
  }
}

/** Chip toggles behave like the VS Code find widget's option buttons. */
function wireChip(button: HTMLButtonElement) {
  button.onclick = () => {
    button.setAttribute("aria-pressed", isPressed(button) ? "false" : "true")
    runSearch()
  }
}

export function isFindOpen(): boolean {
  return !panel.classList.contains("hidden")
}

export function openFind() {
  panel.classList.remove("hidden")
  findInput.focus()
  findInput.select()
  if (findInput.value) runSearch()
}

export function closeFind() {
  panel.classList.add("hidden")
  clearTimeout(searchTimer)
  matches = []
  current = -1
  state.matches = []
  state.currentMatch = null
  refreshSelectionClasses()
  dom.grid.focus()
}

/** Debounced so typing a query does not search on every keystroke. */
function scheduleSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 150)
}

function runSearch() {
  vscode.postMessage({ type: "find", payload: options() })
}

export function handleFindResults(payload: FindResultsPayload) {
  // A reply that outlived the panel, e.g. the re-search queued after a replace
  // landing just after the user pressed Escape. Without this the highlights
  // come back on a closed panel.
  if (!isFindOpen()) return
  // A stale response for a query the user has already changed.
  if (payload.query !== findInput.value) return

  matches = payload.matches
  truncated = payload.truncated
  current = matches.length > 0 ? 0 : -1

  state.matches = matches
  updateLabel()
  highlight()
  if (current >= 0) reveal()
}

function updateLabel() {
  if (findInput.value === "") {
    countLabel.textContent = ""
    countLabel.classList.remove("none")
    return
  }
  if (matches.length === 0) {
    countLabel.textContent = "No results"
    countLabel.classList.add("none")
    return
  }
  countLabel.classList.remove("none")
  const total = truncated ? `${matches.length}+` : String(matches.length)
  countLabel.textContent = `${current + 1} of ${total}`
}

function highlight() {
  state.currentMatch = current >= 0 ? matches[current] : null
  refreshSelectionClasses()
}

function reveal() {
  const match = matches[current]
  if (!match) return
  selectCell(match.row, match.col)
  scrollRowIntoView(match.row)
  highlight()
}

export function step(delta: number) {
  if (matches.length === 0) return
  current = (current + delta + matches.length) % matches.length
  updateLabel()
  reveal()
}

function replaceCurrent() {
  const match = matches[current]
  if (!match) return
  vscode.postMessage({
    type: "replace",
    payload: { ...options(), replacement: replaceInput.value, ...match },
  })
  // The edit triggers a refresh; re-run the search against the new content.
  setTimeout(runSearch, 60)
}

function replaceAll() {
  if (matches.length === 0) return
  vscode.postMessage({
    type: "replace",
    payload: { ...options(), replacement: replaceInput.value, all: true },
  })
  setTimeout(runSearch, 60)
}

findInput.oninput = scheduleSearch
wireChip(matchCase)
wireChip(wholeCell)

findInput.onkeydown = (event) => {
  if (event.key === "Enter") {
    event.preventDefault()
    step(event.shiftKey ? -1 : 1)
  } else if (event.key === "Escape") {
    event.preventDefault()
    closeFind()
  }
  event.stopPropagation()
}

replaceInput.onkeydown = (event) => {
  if (event.key === "Enter") {
    event.preventDefault()
    replaceCurrent()
  } else if (event.key === "Escape") {
    event.preventDefault()
    closeFind()
  }
  event.stopPropagation()
}

;(document.getElementById("findNext") as HTMLButtonElement).onclick = () => step(1)
;(document.getElementById("findPrev") as HTMLButtonElement).onclick = () => step(-1)
;(document.getElementById("replaceOne") as HTMLButtonElement).onclick = replaceCurrent
;(document.getElementById("replaceAll") as HTMLButtonElement).onclick = replaceAll
;(document.getElementById("findClose") as HTMLButtonElement).onclick = closeFind
