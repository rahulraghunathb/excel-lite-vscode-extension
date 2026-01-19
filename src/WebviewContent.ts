export function getHtmlShell(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Excel Lite</title>
    <style>
        :root { 
            --bg-primary: var(--vscode-editor-background); 
            --bg-secondary: var(--vscode-sideBar-background); 
            --bg-header: var(--vscode-editorGroupHeader-tabsBackground); 
            --border-color: var(--vscode-panel-border); 
            --text-primary: var(--vscode-editor-foreground); 
            --text-secondary: var(--vscode-descriptionForeground); 
            --accent: var(--vscode-focusBorder); 
            --selection: color-mix(in srgb, var(--vscode-editor-selectionBackground) 60%, transparent);
        }
        body[data-theme="light"] { 
            --bg-primary: #f5f6f8; 
            --bg-secondary: #ffffff; 
            --bg-header: #eef0f3; 
            --border-color: #d0d4da; 
            --text-primary: #1f2328; 
            --text-secondary: #6b7280; 
            --accent: #1f6feb; 
            --selection: rgba(31, 111, 235, 0.2);
        }
        body[data-theme="dark"] { 
            --bg-primary: #1e1e1e; 
            --bg-secondary: #252526; 
            --bg-header: #2d2d30; 
            --border-color: #3c3c3c; 
            --text-primary: #cccccc; 
            --text-secondary: #9d9d9d; 
            --accent: #0e639c; 
            --selection: rgba(14, 99, 156, 0.4);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--bg-primary); color: var(--text-primary); overflow: hidden; height: 100vh; display: flex; flex-direction: column; }
        .toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); }
        .grid-container { flex: 1; overflow: auto; position: relative; }
        table { border-collapse: collapse; min-width: 100%; table-layout: fixed; }
        thead th { position: sticky; top: 0; z-index: 20; background: var(--bg-header); border: 1px solid var(--border-color); padding: 8px; font-weight: 600; text-align: left; min-width: 100px; white-space: normal; word-break: break-word; }
        thead tr:first-child th { top: 0; }
        thead tr:last-child th { top: 32px; }
        th:first-child, td:first-child { position: sticky; left: 0; z-index: 15; background: var(--bg-secondary); text-align: center; min-width: 50px; width: 50px; border-right: 2px solid var(--border-color); }
        thead th:first-child { z-index: 30; }
        th.corner { background: var(--bg-secondary); }
        th.col-letter { text-align: center; font-weight: 600; cursor: pointer; position: relative; }
        th.header-cell { position: relative; }
        td.row-header { position: sticky; left: 0; background: var(--bg-secondary); }
        td { border: 1px solid var(--border-color); padding: 6px 12px; white-space: normal; word-break: break-word; overflow: hidden; cursor: cell; vertical-align: top; }
        td.selected { background: var(--selection) !important; outline: 1px solid var(--accent); }
        th.col-selected, td.row-selected { background: color-mix(in srgb, var(--selection) 70%, transparent); }
        .status-bar { padding: 4px 12px; background: var(--bg-secondary); border-top: 1px solid var(--border-color); font-size: 11px; display: flex; justify-content: space-between; align-items: center; height: 24px;}
        .sheet-tabs { display: flex; gap: 6px; padding: 4px 8px; background: var(--bg-secondary); border-top: 1px solid var(--border-color); overflow-x: auto; }
        .sheet-tab { padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; background: var(--bg-header); border: 1px solid var(--border-color); white-space: nowrap; }
        .sheet-tab.active { background: #1a7f37; color: white; border-color: #1a7f37; }
        .col-resizer { position: absolute; top: 0; right: 0; width: 6px; height: 100%; cursor: col-resize; }
        .row-resizer { position: absolute; bottom: 0; left: 0; height: 6px; width: 100%; cursor: row-resize; }
        .filter-popup { display: none; position: absolute; background: var(--bg-primary); border: 1px solid var(--border-color); padding: 10px; z-index: 100; box-shadow: 0 8px 18px rgba(0,0,0,0.4); width: 240px; border-radius: 6px; }
        .filter-section { padding: 6px 0; border-bottom: 1px solid var(--border-color); }
        .filter-section:last-child { border-bottom: none; }
        .filter-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; cursor: pointer; }
        .filter-item:hover { background: color-mix(in srgb, var(--selection) 45%, transparent); }
        .filter-item .arrow { margin-left: auto; opacity: 0.6; }
        .filter-subtitle { font-size: 11px; color: var(--text-secondary); margin: 4px 0 8px; }
        .filter-actions { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
        .filter-actions button { padding: 0; background: none; border: none; color: var(--accent); cursor: pointer; }
        .filter-search { display: flex; align-items: center; gap: 6px; background: var(--bg-secondary); border: 1px solid var(--border-color); padding: 6px 8px; border-radius: 6px; margin: 8px 0; }
        .filter-search input { border: none; outline: none; background: transparent; color: var(--text-primary); width: 100%; }
        .filter-values { max-height: 160px; overflow: auto; padding-right: 4px; }
        .filter-values label { display: flex; align-items: center; gap: 8px; padding: 6px 6px; border-radius: 4px; cursor: pointer; }
        .filter-values label:hover { background: color-mix(in srgb, var(--selection) 45%, transparent); }
        .filter-footer { display: flex; justify-content: space-between; gap: 8px; padding-top: 10px; }
        .filter-footer button { flex: 1; padding: 6px 8px; border-radius: 4px; border: 1px solid transparent; cursor: pointer; font-weight: 600; }
        .filter-footer .cancel { background: transparent; border-color: var(--border-color); color: var(--text-primary); }
        .filter-footer .ok { background: #1a7f37; color: white; }
        .show { display: block; }
        .edit-input { position: absolute; border: 2px solid var(--accent); background: var(--bg-primary); color: var(--text-primary); z-index: 50; padding: 4px; font-family: inherit; }
        button { background: var(--bg-header); border: 1px solid var(--border-color); color: var(--text-primary); padding: 4px 8px; cursor: pointer; border-radius: 2px; }
        button:hover { background: var(--border-color); }
        .filter-icon { font-size: 10px; opacity: 0.5; padding: 2px; cursor: pointer; float: right;}
        .filter-icon:hover { opacity: 1; }
        .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; }
        .toggle input { display: none; }
        .toggle .track { width: 38px; height: 20px; border-radius: 999px; background: var(--border-color); position: relative; transition: background 0.2s ease; }
        .toggle .thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: white; transition: transform 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
        .toggle input:checked + .track { background: #1a7f37; }
        .toggle input:checked + .track .thumb { transform: translateX(18px); }
        #loading { position: absolute; top:0; left:0; right:0; bottom:0; background: var(--bg-primary); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    </style>
</head>
<body>
    <div id="loading">Loading Data...</div>

    <div class="toolbar">
        <button id="boldBtn" title="Bold"><b>B</b></button>
        <input type="color" id="fillColor" value="#0e639c" style="width:30px; height:24px; border:none; padding:0; background:none; cursor:pointer;">
        <button id="fillBtn" title="Fill Color">🪣</button>
        <button id="noFillBtn" title="No Fill">No Color</button>
        <div style="width: 1px; height: 20px; background: var(--border-color); margin: 0 4px;"></div>
        <label class="toggle">
            <input type="checkbox" id="autoSaveToggle">
            <span class="track"><span class="thumb"></span></span>
            Auto Save
        </label>
        <label class="toggle">
            <input type="checkbox" id="themeToggle">
            <span class="track"><span class="thumb"></span></span>
            Dark Mode
        </label>
        <span style="flex:1"></span>
        <button id="renameFileBtn" title="Rename File">Rename File</button>
        <button id="renameSheetBtn" title="Rename Sheet">Rename Sheet</button>
        <span id="sheetName" style="font-size: 12px; font-weight: 500;"></span>
    </div>

    <div class="grid-container" id="grid">
        <table id="dataTable">
            <thead>
                <tr id="colLetters"></tr>
                <tr id="headRow"></tr>
            </thead>
            <tbody id="gridBody"></tbody>
        </table>
    </div>

    <div class="status-bar">
        <div id="selInfo">Click to select | Double-click to edit</div>
        <div id="agg" style="display:none">
            <span id="sumWrap">SUM: <span id="sVal"></span> | </span>
            COUNT: <span id="cVal"></span>
            <span id="avgWrap"> | AVG: <span id="aVal"></span></span>
        </div>
    </div>

    <div class="sheet-tabs" id="sheetTabs"></div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentRows = [];
        let numCols = 0;
        let sR = null, sE = null, isS = false;
        let anchor = null;
        let ranges = [];
        let activeRangeIndex = -1;
        let eventsBound = false;
        let columnWidths = [];
        let rowHeights = [];
        let resizing = null;
        let resizeStart = 0;
        let resizeSize = 0;
        
        const grid = document.getElementById('grid');
        const gridBody = document.getElementById('gridBody');
        const headRow = document.getElementById('headRow');
        const colLetters = document.getElementById('colLetters');
        const loading = document.getElementById('loading');
        const sheetTabs = document.getElementById('sheetTabs');
        const themeToggle = document.getElementById('themeToggle');
        const state = vscode.getState() || {};
        const initialTheme = state.theme || 'dark';

        applyTheme(initialTheme);
        themeToggle.checked = initialTheme === 'dark';

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'update':
                    renderGrid(message.payload);
                    break;
                case 'aggregates':
                    updateAggregatesUI(message.payload);
                    break;
            }
        });

        function renderGrid(data) {
            loading.style.display = 'none';
            currentRows = data.rows;
            numCols = data.headers.length;
            document.getElementById('sheetName').innerText = data.sheetName;
            document.getElementById('autoSaveToggle').checked = data.isAutoSaveEnabled;
            renderSheetTabs(data);

            // Render Column Letters
            let lettersHtml = '<th class="corner"></th>';
            for (let i = 0; i < numCols; i++) {
                lettersHtml += '<th class="col-letter" data-col="' + i + '">' + getColumnLetter(i) + '<div class="col-resizer" data-col="' + i + '"></div></th>';
            }
            colLetters.innerHTML = lettersHtml;

            // Render Headers
            let hHtml = '<th id="selectAll">#</th>';
            data.headers.forEach((h, i) => {
                hHtml += '<th class="header-cell" data-col="' + i + '">' + escapeHtml(h) + ' <span class="filter-icon">▼</span>' +
                    '<div class="filter-popup" data-col="' + i + '">' +
                        '<div class="filter-section">' +
                            '<div class="filter-item" data-action="sort-asc">Sort A to Z</div>' +
                            '<div class="filter-item" data-action="sort-desc">Sort Z to A</div>' +
                            '<div class="filter-item" data-action="sort-color">Sort by colour <span class="arrow">▶</span></div>' +
                        '</div>' +
                        '<div class="filter-section">' +
                            '<div class="filter-item" data-action="filter-color">Filter by colour <span class="arrow">▶</span></div>' +
                            '<div class="filter-item" data-action="filter-condition">Filter by condition <span class="arrow">▶</span></div>' +
                            '<div class="filter-item" data-action="filter-values">Filter by values</div>' +
                        '</div>' +
                        '<div class="filter-section">' +
                            '<div class="filter-actions">' +
                                '<div>' +
                                    '<button class="select-all" type="button">Select all</button>' +
                                    '<span>•</span>' +
                                    '<button class="clear" type="button">Clear</button>' +
                                '</div>' +
                                '<div class="displaying">Displaying 0</div>' +
                            '</div>' +
                            '<div class="filter-search">' +
                                '<input type="text" placeholder="Search">' +
                                '<span>🔍</span>' +
                            '</div>' +
                            '<div class="filter-values"></div>' +
                        '</div>' +
                        '<div class="filter-footer">' +
                            '<button class="cancel" type="button">Cancel</button>' +
                            '<button class="ok" type="button">OK</button>' +
                        '</div>' +
                    '</div>' +
                '</th>';
            });
            headRow.innerHTML = hHtml;

            // Render Body
            let bHtml = '';
            data.rows.forEach((row, dIdx) => {
                const oIdx = data.originalIndices[dIdx];
                bHtml += '<tr style="height:' + (rowHeights[dIdx] || 24) + 'px"><td class="row-header" data-row-idx="' + dIdx + '">' + (oIdx + 1) + '<div class="row-resizer" data-row="' + dIdx + '"></div></td>';
                row.forEach((cell, cIdx) => {
                    const style = data.styles[oIdx + ',' + cIdx] || {};
                    const styleAttr = (style.bold ? 'font-weight:bold;' : '') + (style.bgColor ? 'background-color:' + style.bgColor : '');
                    const widthStyle = columnWidths[cIdx] ? 'width:' + columnWidths[cIdx] + 'px;' : '';
                    bHtml += '<td data-row="' + dIdx + '" data-col="' + cIdx + '" style="' + styleAttr + widthStyle + '">' + escapeHtml(String(cell ?? '')) + '</td>';
                });
                bHtml += '</tr>';
            });
            gridBody.innerHTML = bHtml;
            attachEvents();
            applyColumnWidths();
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function renderSheetTabs(data) {
            if (!data.sheets || data.sheets.length === 0) {
                sheetTabs.innerHTML = '';
                return;
            }
            sheetTabs.innerHTML = data.sheets
                .map((sheet) => {
                    const active = sheet.index === data.sheetIndex ? ' active' : '';
                    return '<button class="sheet-tab' + active + '" data-index="' + sheet.index + '">' + escapeHtml(sheet.name) + '</button>';
                })
                .join('');
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

        function updateAggregatesUI(payload) {
            const agg = document.getElementById('agg');
            const sumWrap = document.getElementById('sumWrap');
            const avgWrap = document.getElementById('avgWrap');
            if (payload) {
                agg.style.display = 'block';
                sumWrap.style.display = payload.showStats ? 'inline' : 'none';
                avgWrap.style.display = payload.showStats ? 'inline' : 'none';
                document.getElementById('sVal').innerText = payload.sum;
                document.getElementById('cVal').innerText = payload.count;
                document.getElementById('aVal').innerText = payload.avg;
            } else {
                agg.style.display = 'none';
            }
        }

        function attachEvents() {
            document.querySelectorAll('.filter-icon').forEach(i => {
                i.onclick = (e) => {
                    e.stopPropagation();
                    const p = i.nextElementSibling;
                    const shown = p.classList.contains('show');
                    document.querySelectorAll('.filter-popup').forEach(item => item.classList.remove('show'));
                    if (!shown) {
                        populateFilterValues(p);
                        p.classList.add('show');
                    }
                };
            });

            document.querySelectorAll('th[data-col]').forEach(th => {
                th.onclick = (e) => {
                    if (th.classList.contains('col-letter')) return;
                    if (e.target.classList.contains('filter-icon')) return;
                    if (e.target.closest('.filter-popup')) return;
                    vscode.postMessage({ type: 'sort', payload: { column: parseInt(th.dataset.col) } });
                };
            });

            document.querySelectorAll('.filter-popup').forEach(popup => {
                popup.onclick = (e) => e.stopPropagation();
            });

            document.querySelectorAll('.filter-item[data-action="sort-asc"]').forEach(item => {
                item.onclick = () => {
                    const p = item.closest('.filter-popup');
                    vscode.postMessage({ type: 'sort', payload: { column: parseInt(p.dataset.col), direction: 'asc' } });
                    p.classList.remove('show');
                };
            });

            document.querySelectorAll('.filter-item[data-action="sort-desc"]').forEach(item => {
                item.onclick = () => {
                    const p = item.closest('.filter-popup');
                    vscode.postMessage({ type: 'sort', payload: { column: parseInt(p.dataset.col), direction: 'desc' } });
                    p.classList.remove('show');
                };
            });

            document.querySelectorAll('.filter-item[data-action="filter-values"]').forEach(item => {
                item.onclick = () => {
                    const p = item.closest('.filter-popup');
                    populateFilterValues(p);
                };
            });

            document.querySelectorAll('.filter-item[data-action="filter-condition"]').forEach(item => {
                item.onclick = () => {
                    const p = item.closest('.filter-popup');
                    p.classList.add('show');
                };
            });

            document.querySelectorAll('.filter-popup .clear').forEach(btn => {
                btn.onclick = () => {
                    const p = btn.closest('.filter-popup');
                    if (btn.classList.contains('clear')) {
                        if (btn.classList.contains('select-all')) return;
                    }
                    p.querySelectorAll('.filter-values input[type="checkbox"]').forEach(cb => cb.checked = false);
                };
            });

            document.querySelectorAll('.filter-popup .select-all').forEach(btn => {
                btn.onclick = () => {
                    const p = btn.closest('.filter-popup');
                    p.querySelectorAll('.filter-values input[type="checkbox"]').forEach(cb => cb.checked = true);
                };
            });

            document.querySelectorAll('.filter-popup .cancel').forEach(btn => {
                btn.onclick = () => {
                    const p = btn.closest('.filter-popup');
                    p.classList.remove('show');
                };
            });

            document.querySelectorAll('.filter-popup .ok').forEach(btn => {
                btn.onclick = () => {
                    const p = btn.closest('.filter-popup');
                    const values = Array.from(p.querySelectorAll('.filter-values input[type="checkbox"]'))
                        .filter(cb => cb.checked)
                        .map(cb => cb.value);
                    vscode.postMessage({ type: 'filter', payload: { column: parseInt(p.dataset.col), operator: 'in', value: values }});
                    p.classList.remove('show');
                };
            });

            document.querySelectorAll('.sheet-tab').forEach(tab => {
                tab.onclick = () => vscode.postMessage({ type: 'switchSheet', payload: { index: parseInt(tab.dataset.index) } });
                tab.ondblclick = () => vscode.postMessage({ type: 'renameSheet', payload: { index: parseInt(tab.dataset.index) } });
            });

            document.querySelectorAll('.col-resizer').forEach(handle => {
                handle.onmousedown = (e) => {
                    e.stopPropagation();
                    const col = parseInt(handle.dataset.col);
                    resizing = { type: 'col', index: col };
                    resizeStart = e.clientX;
                    const th = handle.parentElement;
                    resizeSize = th.getBoundingClientRect().width;
                };
            });

            document.querySelectorAll('.row-resizer').forEach(handle => {
                handle.onmousedown = (e) => {
                    e.stopPropagation();
                    const row = parseInt(handle.dataset.row);
                    resizing = { type: 'row', index: row };
                    resizeStart = e.clientY;
                    const tr = handle.closest('tr');
                    resizeSize = tr.getBoundingClientRect().height;
                };
            });

            if (!eventsBound) {
                document.addEventListener('click', () => {
                    document.querySelectorAll('.filter-popup').forEach(item => item.classList.remove('show'));
                });
                document.addEventListener('mousemove', (e) => {
                    if (!resizing) return;
                    if (resizing.type === 'col') {
                        const next = Math.max(50, resizeSize + (e.clientX - resizeStart));
                        columnWidths[resizing.index] = next;
                        applyColumnWidths();
                    } else {
                        const next = Math.max(18, resizeSize + (e.clientY - resizeStart));
                        rowHeights[resizing.index] = next;
                        applyRowHeights();
                    }
                });
                document.addEventListener('mouseup', () => {
                    resizing = null;
                });
                eventsBound = true;
            }
        }

        function applyColumnWidths() {
            document.querySelectorAll('th.col-letter, th.header-cell').forEach(th => {
                const c = parseInt(th.dataset.col);
                if (columnWidths[c]) th.style.width = columnWidths[c] + 'px';
            });
            document.querySelectorAll('td[data-col]').forEach(td => {
                const c = parseInt(td.dataset.col);
                if (columnWidths[c]) td.style.width = columnWidths[c] + 'px';
            });
        }

        function applyRowHeights() {
            document.querySelectorAll('tbody tr').forEach(tr => {
                const rowHeader = tr.querySelector('.row-header');
                if (!rowHeader) return;
                const r = parseInt(rowHeader.dataset.rowIdx);
                if (rowHeights[r]) tr.style.height = rowHeights[r] + 'px';
            });
        }

        function populateFilterValues(popup) {
            const colIndex = parseInt(popup.dataset.col);
            const values = currentRows.map(row => String(row[colIndex] ?? ''));
            const unique = Array.from(new Set(values));
            const list = popup.querySelector('.filter-values');
            const search = popup.querySelector('.filter-search input');
            const displaying = popup.querySelector('.displaying');

            const renderList = (term) => {
                list.innerHTML = '';
                const filtered = unique.filter(v => v.toLowerCase().includes(term.toLowerCase()));
                filtered.forEach(v => {
                    const label = document.createElement('label');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = v;
                    checkbox.checked = true;
                    const span = document.createElement('span');
                    span.innerText = v || '(Blank)';
                    label.appendChild(checkbox);
                    label.appendChild(span);
                    list.appendChild(label);
                });
                displaying.textContent = 'Displaying ' + filtered.length;
            };

            search.oninput = () => renderList(search.value || '');
            renderList('');
        }

        grid.onmousedown = e => {
            const td = e.target.closest('td[data-row]');
            if (e.target.closest('.col-resizer') || e.target.closest('.row-resizer')) return;
            const th = e.target.closest('th[data-col]');
            const rh = e.target.closest('.row-header');
            
            if (td) {
                const point = { r: parseInt(td.dataset.row), c: parseInt(td.dataset.col) };
                if (e.shiftKey && anchor) {
                    isS = false;
                    sR = { ...anchor };
                    sE = { ...point };
                    ranges = [{ startRow: Math.min(sR.r, sE.r), startCol: Math.min(sR.c, sE.c), endRow: Math.max(sR.r, sE.r), endCol: Math.max(sR.c, sE.c) }];
                } else if (e.ctrlKey || e.metaKey) {
                    isS = false;
                    sR = { ...point };
                    sE = { ...point };
                    const exists = ranges.some(range => range.startRow === point.r && range.endRow === point.r && range.startCol === point.c && range.endCol === point.c);
                    ranges = exists
                        ? ranges.filter(range => !(range.startRow === point.r && range.endRow === point.r && range.startCol === point.c && range.endCol === point.c))
                        : [...ranges, { startRow: point.r, startCol: point.c, endRow: point.r, endCol: point.c }];
                } else {
                    isS = true;
                    sR = { ...point };
                    sE = { ...point };
                    anchor = { ...point };
                    ranges = [{ startRow: point.r, startCol: point.c, endRow: point.r, endCol: point.c }];
                    activeRangeIndex = 0;
                }
                updateSelectionUI();
                postSelection();
            } else if (th) {
                if (!th.classList.contains('col-letter')) return;
                if (e.target.classList.contains('filter-icon')) return;
                const c = parseInt(th.dataset.col);
                isS = false;
                sR = { r: 0, c: c };
                sE = { r: currentRows.length - 1, c: c };
                anchor = { r: 0, c: c };
                ranges = [{ startRow: 0, startCol: c, endRow: currentRows.length - 1, endCol: c }];
                updateSelectionUI();
                postSelection();
            } else if (rh) {
                const r = parseInt(rh.dataset.rowIdx);
                isS = false;
                sR = { r: r, c: 0 };
                sE = { r: r, c: numCols - 1 };
                anchor = { r: r, c: 0 };
                ranges = [{ startRow: r, startCol: 0, endRow: r, endCol: numCols - 1 }];
                updateSelectionUI();
                postSelection();
            }
        };

        grid.onmousemove = e => {
            if (isS) {
                const td = e.target.closest('td[data-row]');
                if (td) {
                    sE = { r: parseInt(td.dataset.row), c: parseInt(td.dataset.col) };
                    const updated = { startRow: Math.min(sR.r, sE.r), startCol: Math.min(sR.c, sE.c), endRow: Math.max(sR.r, sE.r), endCol: Math.max(sR.c, sE.c) };
                    if (activeRangeIndex >= 0 && ranges[activeRangeIndex]) ranges[activeRangeIndex] = updated;
                    else ranges = [updated];
                    updateSelectionUI();
                }
            }
        };

        document.onmouseup = () => {
            if (isS) {
                isS = false;
                postSelection();
            }
        };

        function updateSelectionUI() {
            if (ranges.length === 0) return;
            
            document.querySelectorAll('td[data-row]').forEach(td => {
                const r = parseInt(td.dataset.row), c = parseInt(td.dataset.col);
                const selected = ranges.some(range => r >= range.startRow && r <= range.endRow && c >= range.startCol && c <= range.endCol);
                td.classList.toggle('selected', selected);
            });

            document.querySelectorAll('td.row-header').forEach(rh => {
                const r = parseInt(rh.dataset.rowIdx);
                const selected = ranges.some(range => r >= range.startRow && r <= range.endRow && range.startCol === 0 && range.endCol === numCols - 1);
                rh.classList.toggle('row-selected', selected);
            });

            document.querySelectorAll('th.col-letter, th.header-cell').forEach(th => {
                const c = parseInt(th.dataset.col);
                const selected = ranges.some(range => c >= range.startCol && c <= range.endCol && range.startRow === 0 && range.endRow === currentRows.length - 1);
                th.classList.toggle('col-selected', selected);
            });
        }

        function postSelection() {
            if (ranges.length === 0) return;
            vscode.postMessage({ type: 'selection', payload: { ranges }});
        }

        grid.ondblclick = e => {
            const td = e.target.closest('td[data-row]');
            if (!td) return;
            
            const rect = td.getBoundingClientRect();
            const input = document.createElement('input');
            input.className = 'edit-input';
            input.value = td.textContent;
            input.style.top = (rect.top + window.scrollY) + 'px';
            input.style.left = (rect.left + window.scrollX) + 'px';
            input.style.width = rect.width + 'px';
            input.style.height = rect.height + 'px';
            
            document.body.appendChild(input);
            input.focus();
            input.select();
            
            const finish = () => {
                if (input.parentNode) {
                    vscode.postMessage({ type: 'edit', payload: { 
                        row: parseInt(td.dataset.row), 
                        col: parseInt(td.dataset.col), 
                        value: input.value 
                    }});
                    document.body.removeChild(input);
                }
            };
            
            input.onblur = finish;
            input.onkeydown = env => { 
                if (env.key === 'Enter') finish(); 
                if (env.key === 'Escape') document.body.removeChild(input); 
            };
        };

        document.onkeydown = e => {
            if (e.target.tagName === 'INPUT') return;
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'c') vscode.postMessage({ type: 'clipboard', payload: { action: 'copy' } });
                else if (e.key === 'x') vscode.postMessage({ type: 'clipboard', payload: { action: 'cut' } });
                else if (e.key === 'v') vscode.postMessage({ type: 'clipboard', payload: { action: 'paste' } });
                else if (e.key === 'z') {
                    e.preventDefault();
                    vscode.postMessage({ type: 'undo' });
                }
            }
        };

        document.getElementById('boldBtn').onclick = () => vscode.postMessage({ type: 'style', payload: { type: 'bold' } });
        document.getElementById('fillBtn').onclick = () => vscode.postMessage({ type: 'style', payload: { type: 'fill', color: document.getElementById('fillColor').value } });
        document.getElementById('noFillBtn').onclick = () => vscode.postMessage({ type: 'style', payload: { type: 'clearFill' } });
        document.getElementById('renameFileBtn').onclick = () => vscode.postMessage({ type: 'renameFile' });
        document.getElementById('renameSheetBtn').onclick = () => vscode.postMessage({ type: 'renameSheet' });
        document.getElementById('autoSaveToggle').onchange = (e) => vscode.postMessage({ type: 'autoSaveToggle', payload: e.target.checked });
        themeToggle.onchange = () => {
            const theme = themeToggle.checked ? 'dark' : 'light';
            applyTheme(theme);
            vscode.setState({ ...state, theme });
        };

        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`
}
