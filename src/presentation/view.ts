// Browser scripts deliberately use namespaces: the sandbox has no CommonJS loader.
namespace DirDeltaView {
  type ComparisonData = import('../types').Comparison
  type ResultRow = import('../types').Row
  type TreeItem = DirDeltaTree.Item
  const rowsPerChunk = 200
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
    if (!value) throw new Error(`Arayüz öğesi bulunamadı: ${id}`)
    return value as T
  }
  export function createResults() {
    let renderToken = 0
    return function render(state: ViewState, actions: ViewActions) {
      const { data, tree, expandedFolders, query, hideHiddenItems } = state
      const token = ++renderToken
      renderStats(data)
      const results = element('results'); results.replaceChildren()
      if (!data) {
        results.append(createEmptyState('▱ ⇄ ▱', 'Karşılaştırmaya hazır', 'İki klasör seçin ve Karşılaştır düğmesine basın.'))
        element('result-count').textContent = 'Henüz karşılaştırma yapılmadı'
        return
      }
      if (!tree) throw new Error('Karşılaştırma ağacı oluşturulmadı.')
      const rows = tree.visible(expandedFolders, query, hideHiddenItems)
      element('result-count').textContent = `${rows.length} satır · ${data.rows.length} toplam öğe · ${(data.elapsed / 1000).toFixed(2)} sn`
      if (!rows.length) {
        results.append(createNoDifferencesState(data, tree, state))
        return
      }
      const { sha256 } = data
      // Build in chunks so searching remains responsive on large directory trees.
      let index = 0
      function appendChunk() {
        if (token !== renderToken) return
        const fragment = document.createDocumentFragment()
        for (let end = Math.min(index + rowsPerChunk, rows.length); index < end; index++) {
          fragment.append(createResultRow(rows[index], results, actions, Boolean(query), sha256))
        }
        results.append(fragment)
        if (index < rows.length) requestAnimationFrame(appendChunk)
      }
      appendChunk()
    }
  }
  export function renderWarnings(warnings: ComparisonData['warnings']) {
    element('warnings').hidden = !warnings.length
    const skipped = warnings.filter(warning => warning.kind === 'skipped')
    const failed = warnings.filter(warning => warning.kind === 'read-error')
    element('warnings-summary').textContent = failed.length
      ? `${failed.length} öğe okunamadı; sonuçlar eksik olabilir.${skipped.length ? ` Ayrıca ${skipped.length} öğe dahil edilmedi.` : ''}`
      : `${skipped.length} öğe karşılaştırmaya dahil edilmedi. Okuma hatası yok.`
    const warningList = element('warnings-list'); warningList.replaceChildren()
    for (const [heading, warnings] of [['Okunamayan öğeler', failed], ['Dahil edilmeyen öğeler', skipped]] as const) {
      if (!warnings.length) continue
      const group = node('section', 'warning-group')
      group.append(node('h3', '', `${heading} (${warnings.length})`))
      for (const warning of warnings) {
        const item = node('div', `warning-item ${warning.kind}`)
        item.append(node('strong', '', `${warning.side === 'left' ? 'Sol' : 'Sağ'} klasör · ${warning.message}`), node('div', 'warning-path', warning.path), node('p', '', warning.suggestion))
        if (warning.code) item.append(node('span', 'warning-code', `Hata kodu: ${warning.code}`))
        group.append(item)
      }
      warningList.append(group)
    }
    return { failed: failed.length, skipped: skipped.length }
  }
  const labels: Record<ResultRow['status'], string> = { 'left-only': 'Yalnızca solda', 'right-only': 'Yalnızca sağda', different: 'İçerik farklı', same: 'Alt öğelerde fark var', unchecked: 'Alt öğelerde fark var', conflict: 'Tür çakışması' }
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
    for (const [id, value] of Object.entries({ total: rows?.length, left: rows?.filter(r => r.status === 'left-only').length, right: rows?.filter(r => r.status === 'right-only').length, different: rows?.filter(r => r.status === 'different' || r.status === 'conflict').length })) element(`stat-${id}`).textContent = value === undefined ? '—' : String(value)
  }
  function createEmptyState(symbol: string, title: string, description: string) {
    const empty = node('div', 'empty')
    empty.append(node('span', 'empty-symbol', symbol), node('h3', '', title), node('p', '', description))
    return empty
  }
  function createNoDifferencesState(data: ComparisonData, tree: NonNullable<ViewState['tree']>, state: ViewState) {
    const { expandedFolders, query, hideHiddenItems } = state
    const hasReadErrors = data.warnings.some(warning => warning.kind === 'read-error')
    const filteredOut = hideHiddenItems && tree.visible(expandedFolders, query).length > 0
    const title = filteredOut ? 'Gizli öğe filtresi dışında fark yok' : query ? 'Aramayla eşleşen fark yok' : hasReadErrors ? 'Okunabilen öğelerde fark bulunamadı' : 'Fark bulunamadı'
    const description = filteredOut ? 'Gizlenen farkları görmek için “Gizli klasörleri ve dosyaları gizle” kutusunun işaretini kaldırın.' : query ? 'Diğer farkları görmek için aramayı değiştir veya temizle.'
      : hasReadErrors ? 'Bazı öğeler okunamadı. Uyarıları inceleyip yeniden karşılaştırın.'
      : data.sha256 ? 'Karşılaştırılan öğelerde yol, tür veya içerik farkı bulunamadı.'
      : 'Yol, tür veya boyut farkı bulunamadı. İçerikleri karşılaştırmak için SHA-256 seçeneğini açın.'
    return createEmptyState(hasReadErrors ? '!' : '✓', title, description)
  }
  function createResultRow(item: TreeItem, results: HTMLElement, actions: ViewActions, isSearching: boolean, sha256: boolean) {
    const row = item.row
    const line = node('div', 'result-row')
    line.dataset.path = row.path
    if (item.depth) line.classList.add('nested-row')
    const toggleable = item.grouped && !isSearching
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
      line.addEventListener('click', event => { if (event.target instanceof Element && !event.target.closest('button')) toggleFolder() })
    }
    for (const side of ['left', 'right'] as const) {
      line.append(createEntryCell(side))
    }
    return line

    function createEntryCell(side: PanelSide) {
      const entry = row[side], cell = node('div', `cell${entry ? '' : ' missing-cell'}`)
      if (!entry) { cell.append(node('span', 'missing', '— Bu klasörde yok')); return cell }
      const name = node('div', 'entry-name'), details = node('div', 'entry-details')
      for (let level = 0; level < item.depth; level++) name.append(node('span', 'tree-indent'))
      if (item.grouped) { const chevron = node('span', 'tree-chevron', item.open ? '▾' : '▸'); chevron.setAttribute('aria-hidden', 'true'); name.append(chevron) }
      name.append(node('span', 'entry-icon', entry.kind === 'directory' ? '▱' : '▤'))
      const title = node('button', 'entry-title', row.path + (entry.kind === 'directory' ? '/' : ''))
      title.title = toggleable ? `${row.path}\n${item.open ? 'Alt öğeleri gizle' : 'Alt öğeleri göster'} · ${item.descendants} öğe` : `${row.path}\nDosya yöneticisinde göster${entry.hash ? `\nSHA-256: ${entry.hash}` : ''}`
      if (toggleable) title.setAttribute('aria-expanded', String(item.open))
      title.disabled = actions.isBusy()
      title.addEventListener('click', () => { if (toggleable) toggleFolder(); else actions.reveal(side, row.path) })
      const subtitle = node('div', 'entry-subtitle'), badge = node('span', `badge ${row.status}`, statusLabel(item, sha256))
      subtitle.append(badge, node('span', '', new Date(entry.modified).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })))
      if (item.grouped) subtitle.append(node('span', 'group-count', `${item.descendants} alt öğe`))
      details.append(title, subtitle); name.append(details)
      const copy = node('button', 'copy-button', side === 'left' ? '→' : '←')
      copy.dataset.conflict = String(row.status === 'conflict')
      copy.disabled = actions.isBusy() || row.status === 'conflict'
      copy.title = row.status === 'conflict' ? 'Dosya/klasör çakışmasını önce elle çözün' : `${row.path} — ${side === 'left' ? 'sağa' : 'sola'} kopyala`
      copy.setAttribute('aria-label', copy.title)
      copy.addEventListener('click', () => actions.copy(side, [row.path]))
      cell.append(name, node('span', 'size', entry.kind === 'directory' ? 'Klasör' : formatSize(entry.size)), copy)
      return cell
    }
  }
  function statusLabel(item: TreeItem, sha256: boolean): string {
    const { row } = item
    if (item.grouped && row.left && row.right) {
      if (row.status === 'left-only') return 'İçerik yalnızca solda'
      if (row.status === 'right-only') return 'İçerik yalnızca sağda'
    }
    if (row.status === 'different' && !sha256) return 'Boyut farklı'
    return labels[row.status]
  }
}
