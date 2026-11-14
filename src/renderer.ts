type ComparisonData = import('./types').Comparison
type PanelSide = import('./types').Side
type ResultRow = import('./types').Row
interface Window { dirdelta: import('./types').DesktopAPI }
const api = window.dirdelta
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
let data: ComparisonData | undefined
let busy = false
let query = ''
let tree: ReturnType<typeof DirDeltaTree.create> | undefined
const expandedFolders = new Set<string>()
let hasLeft = false, hasRight = false
const labels: Record<ResultRow['status'], string> = { 'left-only': 'Yalnızca solda', 'right-only': 'Yalnızca sağda', different: 'İçerik farklı', same: 'Aynı', unchecked: 'Doğrulanmadı', conflict: 'Tür çakışması' }
const sha = el<HTMLInputElement>('sha256')
function setStatus(message: string) { el('status').textContent = message }
function updateControls() {
  el<HTMLButtonElement>('compare').disabled = busy || !hasLeft || !hasRight
  el<HTMLButtonElement>('select-left').disabled = busy
  el<HTMLButtonElement>('select-right').disabled = busy
  sha.disabled = busy
  el('cancel').hidden = !busy
  for (const side of ['left', 'right'] as const) el<HTMLButtonElement>(`bulk-${side}`).disabled = busy || !data?.rows.some(row => row.status === `${side}-only`)
  document.querySelectorAll<HTMLButtonElement>('.copy-button,.entry-title').forEach(button => { button.disabled = busy || button.dataset.conflict === 'true' })
}
function setBusy(value: boolean) { busy = value; updateControls() }
function message(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return /abort/i.test(text) ? 'İşlem iptal edildi. Tamamlanan kopyalar korundu; yeniden karşılaştırabilirsiniz.' : text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
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
function renderStats() {
  const rows = data?.rows
  for (const [id, value] of Object.entries({ total: rows?.length, left: rows?.filter(r => r.status === 'left-only').length, right: rows?.filter(r => r.status === 'right-only').length, different: rows?.filter(r => r.status === 'different' || r.status === 'conflict').length, same: rows?.filter(r => r.status === 'same' || r.status === 'unchecked').length })) el(`stat-${id}`).textContent = value === undefined ? '—' : String(value)
  el('same-label').textContent = data?.sha256 ? 'Aynı' : 'Aynı / doğrulanmamış'
}
let renderToken = 0
function render() {
  const token = ++renderToken
  renderStats(); updateControls()
  const results = el('results'); results.replaceChildren()
  if (!data) {
    const empty = node('div', 'empty'); empty.append(node('span', 'empty-symbol', '▱ ⇄ ▱'), node('h3', '', 'Karşılaştırmaya hazır'), node('p', '', 'İki klasör seçin ve Karşılaştır düğmesine basın.')); results.append(empty)
    el('result-count').textContent = 'Henüz karşılaştırma yapılmadı'; return
  }
  const rows = tree!.visible(expandedFolders, query)
  el('result-count').textContent = `${rows.length} satır · ${data.rows.length} toplam öğe · ${(data.elapsed / 1000).toFixed(2)} sn`
  if (!rows.length) { const empty = node('div', 'empty'); empty.append(node('span', 'empty-symbol', '✓'), node('h3', '', data.rows.length ? 'Bu görünümde öğe yok' : 'Klasörler boş'), node('p', '', 'Diğer sonuçları görmek için aramayı değiştir veya temizle.')); results.append(empty); return }
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
        if (busy) return
        const scroll = results.scrollTop
        if (expandedFolders.has(row.path)) expandedFolders.delete(row.path); else expandedFolders.add(row.path)
        render(); results.scrollTop = scroll
        const target = [...results.querySelectorAll<HTMLElement>('.result-row')].find(element => element.dataset.path === row.path)
        target?.querySelector<HTMLButtonElement>('.entry-title')?.focus({ preventScroll: true })
      }
      if (toggleable) {
        line.classList.add('expandable-row')
        line.addEventListener('click', event => { if (!(event.target as HTMLElement).closest('button')) toggleFolder() })
      }
      for (const side of ['left', 'right'] as const) {
        const entry = row[side], cell = node('div', `cell${entry ? '' : ' missing-cell'}`)
        if (!entry) { cell.append(node('span', 'missing', '— Bu klasörde yok')); line.append(cell); continue }
        const name = node('div', 'entry-name'), details = node('div', 'entry-details')
        for (let level = 0; level < item.depth; level++) name.append(node('span', 'tree-indent'))
        if (item.grouped) { const chevron = node('span', 'tree-chevron', item.open ? '▾' : '▸'); chevron.setAttribute('aria-hidden', 'true'); name.append(chevron) }
        name.append(node('span', 'entry-icon', entry.kind === 'directory' ? '▱' : '▤'))
        const title = node('button', 'entry-title', row.path + (entry.kind === 'directory' ? '/' : ''))
        title.title = toggleable ? `${row.path}\n${item.open ? 'Alt öğeleri gizle' : 'Alt öğeleri göster'} · ${item.descendants} öğe` : `${row.path}\nDosya yöneticisinde göster${entry.hash ? `\nSHA-256: ${entry.hash}` : ''}`
        if (toggleable) title.setAttribute('aria-expanded', String(item.open))
        title.disabled = busy
        title.addEventListener('click', () => { if (toggleable) toggleFolder(); else void api.reveal(side, row.path).catch(error => setStatus(message(error))) })
        const subtitle = node('div', 'entry-subtitle'), badge = node('span', `badge ${row.status}`, item.grouped && row.left && row.right ? (row.status === 'left-only' ? 'İçerik yalnızca solda' : 'İçerik yalnızca sağda') : row.status === 'different' && !data?.sha256 ? 'Boyut farklı' : labels[row.status])
        subtitle.append(badge, node('span', '', new Date(entry.modified).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })))
        if (item.grouped) subtitle.append(node('span', 'group-count', `${item.descendants} alt öğe`))
        details.append(title, subtitle); name.append(details)
        const copy = node('button', 'copy-button', side === 'left' ? '→' : '←')
        copy.dataset.conflict = String(row.status === 'conflict')
        copy.disabled = busy || row.status === 'conflict'
        copy.title = row.status === 'conflict' ? 'Dosya/klasör çakışmasını önce elle çözün' : `${row.path} — ${side === 'left' ? 'sağa' : 'sola'} kopyala`
        copy.setAttribute('aria-label', copy.title)
        copy.addEventListener('click', () => void copyPaths(side, [row.path]))
        cell.append(name, node('span', 'size', entry.kind === 'directory' ? 'Klasör' : formatSize(entry.size)), copy); line.append(cell)
      }
      fragment.append(line)
    }
    results.append(fragment)
    if (index < rows.length) requestAnimationFrame(appendChunk)
  }
  appendChunk()
}
async function compare() {
  if (busy || !hasLeft || !hasRight) return
  setBusy(true); setStatus('Karşılaştırma başlatılıyor…')
  data = undefined; el('warnings').hidden = true; render()
  try {
    data = await api.compare(sha.checked)
    tree = DirDeltaTree.create(data.rows, data.roots.left.startsWith('/') ? '/' : '\\')
    expandedFolders.clear()
    el('warnings').hidden = !data.warnings.length
    const skipped = data.warnings.filter(warning => warning.kind === 'skipped')
    const failed = data.warnings.filter(warning => warning.kind === 'read-error')
    el('warnings-summary').textContent = failed.length
      ? `${failed.length} öğe okunamadı; sonuçlar eksik olabilir.${skipped.length ? ` Ayrıca ${skipped.length} öğe dahil edilmedi.` : ''}`
      : `${skipped.length} öğe karşılaştırmaya dahil edilmedi. Okuma hatası yok.`
    const warningList = el('warnings-list'); warningList.replaceChildren()
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
    setStatus(`Karşılaştırma tamamlandı. ${data.rows.length} öğe incelendi.${failed.length ? ' Bazı öğeler okunamadı; sonuçlar eksik olabilir. Uyarıları inceleyin.' : skipped.length ? ' Dahil edilmeyen öğeler için bilgi alanını inceleyin.' : ''}`)
  } catch (error) { setStatus(message(error)) }
  finally { setBusy(false); render() }
}
async function copyPaths(side: PanelSide, paths: string[]) {
  if (busy || !data) return
  setBusy(true); setStatus('Kopyalama hazırlanıyor…')
  let resultMessage = ''
  try { const result = await api.copy(side, paths); resultMessage = result.cancelled ? 'Kopyalamadan vazgeçildi.' : `${result.copied} öğe kopyalandı.` }
  catch (error) { resultMessage = message(error) }
  finally { setBusy(false) }
  await compare()
  setStatus(`${resultMessage} ${data ? 'Görünüm yenilendi.' : 'Güncel sonuçlar için yeniden karşılaştırın.'}`)
}
for (const side of ['left', 'right'] as const) {
  el(`select-${side}`).addEventListener('click', async () => {
    if (busy) return
    setBusy(true)
    try {
      const folder = await api.selectFolder(side)
      if (!folder) return
      if (side === 'left') hasLeft = true; else hasRight = true
      el(`path-${side}`).textContent = folder; el(`path-${side}`).title = folder
      el(`select-${side}`).title = folder
      data = undefined; el('warnings').hidden = true; render()
      setStatus(hasLeft && hasRight ? 'Klasörler hazır. Karşılaştır düğmesine basın.' : 'Diğer klasörü seçin.')
    } catch (error) { setStatus(message(error)) }
    finally { setBusy(false) }
  })
  el(`bulk-${side}`).addEventListener('click', () => {
    if (!data) return
    const missing = data.rows.filter(row => row.status === `${side}-only`)
    // Do not duplicate descendants when their missing parent directory is selected.
    const paths = new Set(missing.map(row => row.path))
    void copyPaths(side, missing.filter(row => !row.path.split(/[\\/]/).slice(0, -1).some((_, i, parts) => paths.has(parts.slice(0, i + 1).join(row.path.includes('\\') ? '\\' : '/')))).map(row => row.path))
  })
}
el('warnings-info').addEventListener('click', () => el<HTMLDialogElement>('warnings-explanation').showModal())
el('compare').addEventListener('click', () => void compare())
el('cancel').addEventListener('click', () => { setStatus('İptal ediliyor…'); void api.cancel() })
sha.addEventListener('change', () => {
  data = undefined; el('warnings').hidden = true; render()
  el('mode-description').textContent = sha.checked ? 'İçerik karşılaştırması · Kopyalamada SHA-256 doğrulaması' : 'Hızlı karşılaştırma · yol ve dosya boyutu'
  el('verification').textContent = sha.checked ? 'SHA-256 açık' : 'SHA-256 kapalı'
  setStatus('Karşılaştırma yöntemi değişti. Yeniden karşılaştırın.')
})
el<HTMLInputElement>('search').addEventListener('input', event => { query = (event.target as HTMLInputElement).value.toLocaleLowerCase('tr'); render() })
let lastProgress = 0
api.onProgress(progress => { if (Date.now() - lastProgress > 70) { setStatus(`${progress.phase} · ${progress.count} öğe · ${progress.path}`); lastProgress = Date.now() } })
updateControls()
