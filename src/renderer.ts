interface Window { dirdelta: import('./types').DesktopAPI }
;(() => {
  type ComparisonData = import('./types').Comparison
  type PanelSide = import('./types').Side
  const api = window.dirdelta
  const el = DirDeltaView.element
  let data: ComparisonData | undefined
  let busy = false
  let query = ''
  let tree: ReturnType<typeof DirDeltaTree.create> | undefined
  const expandedFolders = new Set<string>()
  let hasLeft = false, hasRight = false
  const hideHiddenItems = el<HTMLInputElement>('hide-hidden-items')
  hideHiddenItems.addEventListener('change', () => render())
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
  const renderResults = DirDeltaView.createResults()
  function render() {
    updateControls()
    renderResults({ data, tree, expandedFolders, query, hideHiddenItems: hideHiddenItems.checked }, {
      isBusy: () => busy,
      toggleFolder: path => {
        if (expandedFolders.has(path)) expandedFolders.delete(path)
        else expandedFolders.add(path)
        render()
      },
      reveal: (side, path) => { void api.reveal(side, path).catch(error => setStatus(message(error))) },
      copy: (side, paths) => { void copyPaths(side, paths) }
    })
  }
  async function compare() {
    if (busy || !hasLeft || !hasRight) return
    setBusy(true); setStatus('Karşılaştırma başlatılıyor…')
    data = undefined; el('warnings').hidden = true; render()
    try {
      data = await api.compare(sha.checked)
      tree = DirDeltaTree.create(data.rows, data.roots.left.startsWith('/') ? '/' : '\\')
      expandedFolders.clear()
      const { failed, skipped } = DirDeltaView.renderWarnings(data.warnings)
      setStatus(`Karşılaştırma tamamlandı. ${data.rows.length} öğe incelendi.${failed ? ' Bazı öğeler okunamadı; sonuçlar eksik olabilir. Uyarıları inceleyin.' : skipped ? ' Dahil edilmeyen öğeler için bilgi alanını inceleyin.' : ''}`)
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
      void copyPaths(side, DirDeltaTree.missingPaths(data.rows, side, data.roots.left.startsWith('/') ? '/' : '\\'))
    })
  }
  el('warnings-info').addEventListener('click', () => el<HTMLDialogElement>('warnings-explanation').showModal())
  el('compare').addEventListener('click', () => void compare())
  el('cancel').addEventListener('click', () => { setStatus('İptal ediliyor…'); void api.cancel().catch(error => setStatus(message(error))) })
  sha.addEventListener('change', () => {
    data = undefined; el('warnings').hidden = true; render()
    el('mode-description').textContent = sha.checked ? 'İçerik karşılaştırması · Kopyalamada SHA-256 doğrulaması' : 'Hızlı karşılaştırma · yol ve dosya boyutu'
    el('verification').textContent = sha.checked ? 'SHA-256 açık' : 'SHA-256 kapalı'
    setStatus('Karşılaştırma yöntemi değişti. Yeniden karşılaştırın.')
  })
  el<HTMLInputElement>('search').addEventListener('input', event => { query = (event.target as HTMLInputElement).value.toLocaleLowerCase('tr'); render() })
  let lastProgress = 0
  const unsubscribeProgress = api.onProgress(progress => { if (Date.now() - lastProgress > 70) { setStatus(`${progress.phase} · ${progress.count} öğe · ${progress.path}`); lastProgress = Date.now() } })
  updateControls()
  window.addEventListener('unload', unsubscribeProgress, { once: true })
})()
