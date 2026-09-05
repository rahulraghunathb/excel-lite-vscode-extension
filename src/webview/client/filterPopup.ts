import { state, vscode } from "./state"
import { escapeHtml } from "./render"
import type { ColumnFilter, FilterOptionsPayload } from "./protocol"

let popup: HTMLDivElement | null = null
let currentColumn = -1
let allValues: string[] = []

export function closeFilterPopup() {
  popup?.remove()
  popup = null
  currentColumn = -1
}

export function isFilterPopupOpen(column?: number): boolean {
  if (!popup) return false
  return column === undefined || currentColumn === column
}

/** Ask the host for this column's options; the popup opens when they arrive. */
export function openFilterPopup(column: number, anchor: HTMLElement) {
  if (isFilterPopupOpen(column)) {
    closeFilterPopup()
    return
  }
  closeFilterPopup()
  currentColumn = column
  pendingAnchor = anchor
  vscode.postMessage({ type: "requestFilterOptions", payload: { column } })
}

let pendingAnchor: HTMLElement | null = null

const CONDITIONS: { value: string; label: string; args: number }[] = [
  { value: "isNotEmpty", label: "Is not empty", args: 0 },
  { value: "isEmpty", label: "Is empty", args: 0 },
  { value: "contains", label: "Text contains", args: 1 },
  { value: "notContains", label: "Text does not contain", args: 1 },
  { value: "startsWith", label: "Text starts with", args: 1 },
  { value: "endsWith", label: "Text ends with", args: 1 },
  { value: "equals", label: "Text is exactly", args: 1 },
  { value: "notEquals", label: "Text is not", args: 1 },
  { value: "gt", label: "Greater than", args: 1 },
  { value: "gte", label: "Greater than or equal to", args: 1 },
  { value: "lt", label: "Less than", args: 1 },
  { value: "lte", label: "Less than or equal to", args: 1 },
  { value: "between", label: "Is between", args: 2 },
]

export function showFilterPopup(payload: FilterOptionsPayload) {
  if (payload.column !== currentColumn) return
  const anchor = pendingAnchor
  if (!anchor) return

  allValues = payload.values

  const element = document.createElement("div")
  element.className = "filter-popup"
  element.innerHTML = `
    <div class="filter-section">
      <button class="filter-item" data-action="sort-asc">Sort A → Z</button>
      <button class="filter-item" data-action="sort-desc">Sort Z → A</button>
      <button class="filter-item" data-action="sort-color">Sort by colour</button>
    </div>
    <div class="filter-tabs">
      <button class="filter-tab active" data-tab="values">By value</button>
      <button class="filter-tab" data-tab="condition">By condition</button>
      <button class="filter-tab" data-tab="color">By colour</button>
    </div>
    <div class="filter-pane" data-pane="values">
      <div class="filter-actions">
        <button class="link select-all" type="button">Select all</button>
        <button class="link clear-all" type="button">Clear</button>
        <span class="displaying"></span>
      </div>
      <div class="filter-search"><input type="text" placeholder="Search values"></div>
      <div class="filter-values"></div>
    </div>
    <div class="filter-pane hidden" data-pane="condition">
      <select class="condition-op">
        ${CONDITIONS.map((c) => `<option value="${c.value}">${c.label}</option>`).join("")}
      </select>
      <input type="text" class="condition-value" placeholder="Value">
      <input type="text" class="condition-value2 hidden" placeholder="And">
    </div>
    <div class="filter-pane hidden" data-pane="color">
      <div class="filter-colors"></div>
    </div>
    <div class="filter-footer">
      <button class="secondary remove-filter" type="button">Remove filter</button>
      <span class="grow"></span>
      <button class="secondary cancel" type="button">Cancel</button>
      <button class="primary apply" type="button">OK</button>
    </div>`

  document.body.appendChild(element)
  popup = element

  positionPopup(element, anchor)
  wireValuesPane(element, payload)
  wireColorsPane(element, payload)
  wireConditionPane(element, payload)
  wireTabs(element, payload)
  wireFooter(element, payload.column)

  element.addEventListener("mousedown", (event) => event.stopPropagation())
  element.addEventListener("click", (event) => event.stopPropagation())
  element.querySelector<HTMLInputElement>(".filter-search input")?.focus()
}

/** Keep the popup on screen when its column sits near an edge. */
function positionPopup(element: HTMLElement, anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect()
  const width = 260
  element.style.width = `${width}px`
  const left = Math.min(
    Math.max(8, rect.left),
    Math.max(8, window.innerWidth - width - 8),
  )
  element.style.left = `${left}px`
  element.style.top = `${rect.bottom + 2}px`
  const maxHeight = window.innerHeight - rect.bottom - 16
  element.style.maxHeight = `${Math.max(220, maxHeight)}px`
}

function wireTabs(element: HTMLElement, payload: FilterOptionsPayload) {
  element.querySelectorAll<HTMLElement>(".filter-tab").forEach((tab) => {
    tab.onclick = () => {
      element
        .querySelectorAll(".filter-tab")
        .forEach((other) => other.classList.remove("active"))
      tab.classList.add("active")
      element.querySelectorAll<HTMLElement>(".filter-pane").forEach((pane) => {
        pane.classList.toggle("hidden", pane.dataset.pane !== tab.dataset.tab)
      })
    }
  })

  // Open on the tab matching whatever filter is already applied.
  const current = payload.current
  if (current && current.kind !== "values") {
    element
      .querySelector<HTMLElement>(`.filter-tab[data-tab="${current.kind}"]`)
      ?.click()
  }
}

function renderValueList(element: HTMLElement, values: string[], checked: Set<string>) {
  const list = element.querySelector<HTMLElement>(".filter-values")!
  list.innerHTML = values
    .map((value, index) => {
      const label = value === "" ? "(Blanks)" : escapeHtml(value)
      return (
        `<label class="filter-value"><input type="checkbox" data-index="${index}"` +
        `${checked.has(value) ? " checked" : ""}><span>${label}</span></label>`
      )
    })
    .join("")
  list.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
    input.onchange = () => {
      const value = values[Number(input.dataset.index)]
      if (input.checked) checked.add(value)
      else checked.delete(value)
    }
  })
  element.querySelector<HTMLElement>(".displaying")!.textContent =
    `${values.length} of ${allValues.length}`
}

const checkedValues = new Set<string>()

function wireValuesPane(element: HTMLElement, payload: FilterOptionsPayload) {
  checkedValues.clear()
  const current = payload.current
  if (current?.kind === "values") current.values.forEach((v) => checkedValues.add(v))
  else payload.values.forEach((v) => checkedValues.add(v))

  let visible = payload.values.slice()
  renderValueList(element, visible, checkedValues)

  const search = element.querySelector<HTMLInputElement>(".filter-search input")!
  search.oninput = () => {
    const term = search.value.toLowerCase()
    visible = payload.values.filter((value) =>
      (value === "" ? "(blanks)" : value.toLowerCase()).includes(term),
    )
    renderValueList(element, visible, checkedValues)
  }

  element.querySelector<HTMLElement>(".select-all")!.onclick = () => {
    visible.forEach((value) => checkedValues.add(value))
    renderValueList(element, visible, checkedValues)
  }
  element.querySelector<HTMLElement>(".clear-all")!.onclick = () => {
    visible.forEach((value) => checkedValues.delete(value))
    renderValueList(element, visible, checkedValues)
  }
}

const checkedColors = new Set<string>()

function wireColorsPane(element: HTMLElement, payload: FilterOptionsPayload) {
  checkedColors.clear()
  const current = payload.current
  if (current?.kind === "color") current.colors.forEach((c) => checkedColors.add(c))
  else payload.colors.forEach((c) => checkedColors.add(c))

  const list = element.querySelector<HTMLElement>(".filter-colors")!
  list.innerHTML = payload.colors
    .map((color, index) => {
      const swatch = color
        ? `<span class="swatch" style="background:${color}"></span>`
        : `<span class="swatch none"></span>`
      const label = color ? color : "(No fill)"
      return (
        `<label class="filter-value"><input type="checkbox" data-index="${index}" checked>` +
        `${swatch}<span>${label}</span></label>`
      )
    })
    .join("")

  list.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
    const color = payload.colors[Number(input.dataset.index)]
    input.checked = checkedColors.has(color)
    input.onchange = () => {
      if (input.checked) checkedColors.add(color)
      else checkedColors.delete(color)
    }
  })
}

function wireConditionPane(element: HTMLElement, payload: FilterOptionsPayload) {
  const select = element.querySelector<HTMLSelectElement>(".condition-op")!
  const value1 = element.querySelector<HTMLInputElement>(".condition-value")!
  const value2 = element.querySelector<HTMLInputElement>(".condition-value2")!

  const syncArgs = () => {
    const spec = CONDITIONS.find((c) => c.value === select.value)
    value1.classList.toggle("hidden", (spec?.args ?? 1) < 1)
    value2.classList.toggle("hidden", (spec?.args ?? 1) < 2)
  }

  const current = payload.current
  if (current?.kind === "condition") {
    select.value = current.operator
    value1.value = current.value ?? ""
    value2.value = current.value2 ?? ""
  }
  select.onchange = syncArgs
  syncArgs()
}

function wireFooter(element: HTMLElement, column: number) {
  const apply = (filter: ColumnFilter | null) => {
    vscode.postMessage({ type: "filter", payload: { column, filter } })
    closeFilterPopup()
  }

  element.querySelectorAll<HTMLElement>(".filter-item").forEach((item) => {
    item.onclick = () => {
      const action = item.dataset.action
      if (action === "sort-asc") {
        vscode.postMessage({ type: "sort", payload: { column, direction: "asc" } })
      } else if (action === "sort-desc") {
        vscode.postMessage({ type: "sort", payload: { column, direction: "desc" } })
      } else if (action === "sort-color") {
        vscode.postMessage({ type: "sort", payload: { column, byColor: true } })
      }
      closeFilterPopup()
    }
  })

  element.querySelector<HTMLElement>(".cancel")!.onclick = () => closeFilterPopup()
  element.querySelector<HTMLElement>(".remove-filter")!.onclick = () => apply(null)

  element.querySelector<HTMLElement>(".apply")!.onclick = () => {
    const activeTab = element.querySelector<HTMLElement>(".filter-tab.active")
      ?.dataset.tab

    if (activeTab === "condition") {
      const operator = element.querySelector<HTMLSelectElement>(".condition-op")!.value
      const value = element.querySelector<HTMLInputElement>(".condition-value")!.value
      const value2 = element.querySelector<HTMLInputElement>(".condition-value2")!.value
      apply({ kind: "condition", operator: operator as never, value, value2 })
      return
    }

    if (activeTab === "color") {
      // Everything ticked means no constraint at all.
      const colors = Array.from(checkedColors)
      apply(colors.length === 0 ? null : { kind: "color", colors })
      return
    }

    const values = Array.from(checkedValues)
    const allTicked = values.length === allValues.length
    apply(allTicked ? null : { kind: "values", values })
  }
}

/** Close the popup when the grid scrolls out from under it. */
export function handleGlobalScroll() {
  if (popup) closeFilterPopup()
}

export function refreshFilterIcons() {
  document.querySelectorAll<HTMLElement>(".header-cell").forEach((th) => {
    th.classList.toggle("filtered", state.activeFilters.has(Number(th.dataset.col)))
  })
}
