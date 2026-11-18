// Browser scripts deliberately use namespaces: the sandbox has no CommonJS loader.
namespace DirDeltaView {
  type ComparisonData = import('../types').Comparison
  type ResultRow = import('../types').Row
  type PanelSide = import('../types').Side
  interface ViewState {
    data?: ComparisonData
    tree?: ReturnType<typeof DirDeltaTree.create>
    expandedFolders: ReadonlySet<string>
    query: string
    hideHiddenItems: boolean
  }
  interface ViewActions {
    isBusy(): boolean
    toggleFolder(path: string): void
    reveal(side: PanelSide, path: string): void
    copy(side: PanelSide, paths: string[]): void
  }
  export function element<T extends HTMLElement = HTMLElement>(id: string): T {
    const value = document.getElementById(id)
    if (!value) throw new Error(`UI element not found: ${id}`)
    return value as T
  }
  const el = element
  const labels: Record<ResultRow['status'], string> = { 'left-only': 'Only on the left', 'right-only': 'Only on the right', different: 'Content differs', same: 'Differences in child items', unchecked: 'Differences in child items', conflict: 'Type conflict' }
  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  }
  function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
    const element = document.createElement(tag); element.className = className
    if (text !== undefined) element.textContent = text
    return element
  }
  function renderStats(data: ComparisonData | undefined) {
    const rows = data?.rows
    for (const [id, value] of Object.entries({ total: rows?.length, left: rows?.filter(r => r.status === 'left-only').length, right: rows?.filter(r => r.status === 'right-only').length, different: rows?.filter(r => r.status === 'different' || r.status === 'conflict').length })) el(`stat-${id}`).textContent = value === undefined ? '—' : String(value)
  }
  export function createResults() {
    let renderToken = 0
    return function render(state: ViewState, actions: ViewActions) {
      const { data, tree, expandedFolders, query, hideHiddenItems } = state
      const token = ++renderToken
      renderStats(data)
      const results = el('results'); results.replaceChildren()
      if (!data) {
        const empty = node('div', 'empty'); empty.append(node('span', 'empty-symbol', '▱ ⇄ ▱'), node('h3', '', 'Ready to compare'), node('p', '', 'Select two folders and click Compare.')); results.append(empty)
        el('result-count').textContent = 'No comparison yet'; return
      }
      if (!tree) throw new Error('Comparison tree has not been created.')
      const rows = tree.visible(expandedFolders, query, hideHiddenItems)
      el('result-count').textContent = `${rows.length} ${rows.length === 1 ? 'row' : 'rows'} · ${data.rows.length} total ${data.rows.length === 1 ? 'item' : 'items'} · ${(data.elapsed / 1000).toFixed(2)} s`
      if (!rows.length) {
        const empty = node('div', 'empty')
        const hasReadErrors = data.warnings.some(warning => warning.kind === 'read-error')
        const filteredOut = hideHiddenItems && tree.visible(expandedFolders, query).length > 0
        const title = filteredOut ? 'All differences are hidden by the hidden-item filter' : query ? 'No differences match your search' : hasReadErrors ? 'No differences found in readable items' : 'No differences found'
        const description = filteredOut ? 'Clear “Hide hidden folders and files” to see the hidden differences.' : query ? 'Change or clear your search to see other differences.'
          : hasReadErrors ? 'Some items could not be read. Review the warnings and compare again.'
          : data.sha256 ? 'No path, type, or content differences were found in the compared items.'
          : 'No path, type, or size differences were found. Enable SHA-256 to compare contents.'
        empty.append(node('span', 'empty-symbol', hasReadErrors ? '!' : '✓'), node('h3', '', title), node('p', '', description))
        results.append(empty)
        return
      }
      // Build in chunks so searching remains responsive on large directory trees.
      let index = 0
      function appendChunk() {
        if (token !== renderToken) return
        const fragment = document.createDocumentFragment()
        for (let end = Math.min(index + 200, rows.length); index < end; index++) {
          const item = rows[index], row = item.row, line = node('div', 'result-row')
          line.dataset.path = row.path
          if (item.depth) line.classList.add('nested-row')
          const toggleable = item.grouped && !query
          function toggleFolder() {
            if (actions.isBusy()) return
            const scroll = results.scrollTop
            actions.toggleFolder(row.path)
            results.scrollTop = scroll
            const target = [...results.querySelectorAll<HTMLElement>('.result-row')].find(element => element.dataset.path === row.path)
            target?.querySelector<HTMLButtonElement>('.entry-title')?.focus({ preventScroll: true })
          }
          if (toggleable) {
            line.classList.add('expandable-row')
            line.addEventListener('click', event => { if (!(event.target as HTMLElement).closest('button')) toggleFolder() })
          }
          for (const side of ['left', 'right'] as const) {
            const entry = row[side], cell = node('div', `cell${entry ? '' : ' missing-cell'}`)
            if (!entry) { cell.append(node('span', 'missing', '— Not in this folder')); line.append(cell); continue }
            const name = node('div', 'entry-name'), details = node('div', 'entry-details')
            for (let level = 0; level < item.depth; level++) name.append(node('span', 'tree-indent'))
            if (item.grouped) { const chevron = node('span', 'tree-chevron', item.open ? '▾' : '▸'); chevron.setAttribute('aria-hidden', 'true'); name.append(chevron) }
            name.append(node('span', 'entry-icon', entry.kind === 'directory' ? '▱' : '▤'))
            const title = node('button', 'entry-title', row.path + (entry.kind === 'directory' ? '/' : ''))
            title.title = toggleable ? `${row.path}\n${item.open ? 'Hide child items' : 'Show child items'} · ${item.descendants} ${item.descendants === 1 ? 'item' : 'items'}` : `${row.path}\nShow in file manager${entry.hash ? `\nSHA-256: ${entry.hash}` : ''}`
            if (toggleable) title.setAttribute('aria-expanded', String(item.open))
            title.disabled = actions.isBusy()
            title.addEventListener('click', () => { if (toggleable) toggleFolder(); else actions.reveal(side, row.path) })
            const subtitle = node('div', 'entry-subtitle'), badge = node('span', `badge ${row.status}`, item.grouped && row.left && row.right && (row.status === 'left-only' || row.status === 'right-only') ? (row.status === 'left-only' ? 'Contents only on the left' : 'Contents only on the right') : row.status === 'different' && !data?.sha256 ? 'Size differs' : labels[row.status])
            subtitle.append(badge, node('span', '', new Date(entry.modified).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })))
            if (item.grouped) subtitle.append(node('span', 'group-count', `${item.descendants} child ${item.descendants === 1 ? 'item' : 'items'}`))
            details.append(title, subtitle); name.append(details)
            const copy = node('button', 'copy-button', side === 'left' ? '→' : '←')
            copy.dataset.conflict = String(row.status === 'conflict')
            copy.disabled = actions.isBusy() || row.status === 'conflict'
            copy.title = row.status === 'conflict' ? 'Resolve the file/folder conflict manually first' : `${row.path} — copy ${side === 'left' ? 'to the right' : 'to the left'}`
            copy.setAttribute('aria-label', copy.title)
            copy.addEventListener('click', () => actions.copy(side, [row.path]))
            cell.append(name, node('span', 'size', entry.kind === 'directory' ? 'Folder' : formatSize(entry.size)), copy); line.append(cell)
          }
          fragment.append(line)
        }
        results.append(fragment)
        if (index < rows.length) requestAnimationFrame(appendChunk)
      }
      appendChunk()
    }
  }
  export function renderWarnings(warnings: ComparisonData['warnings']) {
    el('warnings').hidden = !warnings.length
    const skipped = warnings.filter(warning => warning.kind === 'skipped')
    const failed = warnings.filter(warning => warning.kind === 'read-error')
    el('warnings-summary').textContent = failed.length
      ? `${failed.length} ${failed.length === 1 ? 'item' : 'items'} could not be read; results may be incomplete.${skipped.length ? ` Also, ${skipped.length} ${skipped.length === 1 ? 'item was' : 'items were'} excluded.` : ''}`
      : `${skipped.length} ${skipped.length === 1 ? 'item was' : 'items were'} excluded from comparison. No read errors.`
    const warningList = el('warnings-list'); warningList.replaceChildren()
    for (const [heading, warnings] of [['Unreadable items', failed], ['Excluded items', skipped]] as const) {
      if (!warnings.length) continue
      const group = node('section', 'warning-group')
      group.append(node('h3', '', `${heading} (${warnings.length})`))
      for (const warning of warnings) {
        const item = node('div', `warning-item ${warning.kind}`)
        item.append(node('strong', '', `${warning.side === 'left' ? 'Left' : 'Right'} folder · ${warning.message}`), node('div', 'warning-path', warning.path), node('p', '', warning.suggestion))
        if (warning.code) item.append(node('span', 'warning-code', `Error code: ${warning.code}`))
        group.append(item)
      }
      warningList.append(group)
    }
    return { failed: failed.length, skipped: skipped.length }
  }
}
