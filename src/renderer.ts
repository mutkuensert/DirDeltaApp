interface Window { dirdelta: import('./types').DesktopAPI }
;(() => {
  type ComparisonData = import('./types').Comparison
  type PanelSide = import('./types').Side
  const api = window.dirdelta
  const element = DirDeltaView.element
  let data: ComparisonData | undefined
  let busy = false
  let query = ''
  let tree: ReturnType<typeof DirDeltaTree.create> | undefined
  const expandedFolders = new Set<string>()
  let hasLeft = false, hasRight = false
  const hideHiddenItems = element<HTMLInputElement>('hide-hidden-items')
  hideHiddenItems.addEventListener('change', () => render())
  const sha256Input = element<HTMLInputElement>('sha256')
  const progressIntervalMilliseconds = 70
  function setStatus(message: string) { element('status').textContent = message }
  function updateControls() {
    element<HTMLButtonElement>('compare').disabled = busy || !hasLeft || !hasRight
    element<HTMLButtonElement>('select-left').disabled = busy
    element<HTMLButtonElement>('select-right').disabled = busy
    sha256Input.disabled = busy
    element('cancel').hidden = !busy
    for (const side of ['left', 'right'] as const) element<HTMLButtonElement>(`bulk-${side}`).disabled = busy || !data?.rows.some(row => row.status === `${side}-only`)
    document.querySelectorAll<HTMLButtonElement>('.copy-button,.entry-title').forEach(button => { button.disabled = busy || button.dataset.conflict === 'true' })
  }
  function setBusy(value: boolean) { busy = value; updateControls() }
  function errorMessage(error: unknown) {
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
      reveal: (side, path) => { void api.reveal(side, path).catch(error => setStatus(errorMessage(error))) },
      copy: (side, paths) => { void copyPaths(side, paths) }
    })
  }
  function clearComparison() {
    data = undefined
    element('warnings').hidden = true
    render()
  }
  async function compare() {
    if (busy || !hasLeft || !hasRight) return
    setBusy(true); setStatus('Karşılaştırma başlatılıyor…')
    clearComparison()
    try {
      data = await api.compare(sha256Input.checked)
      tree = DirDeltaTree.create(data.rows, data.roots.left.startsWith('/') ? '/' : '\\')
      expandedFolders.clear()
      const { failed, skipped } = DirDeltaView.renderWarnings(data.warnings)
      setStatus(`Karşılaştırma tamamlandı. ${data.rows.length} öğe incelendi.${failed ? ' Bazı öğeler okunamadı; sonuçlar eksik olabilir. Uyarıları inceleyin.' : skipped ? ' Dahil edilmeyen öğeler için bilgi alanını inceleyin.' : ''}`)
    } catch (error) { setStatus(errorMessage(error)) }
    finally { setBusy(false); render() }
  }
  async function copyPaths(side: PanelSide, paths: string[]) {
    if (busy || !data) return
    setBusy(true); setStatus('Kopyalama hazırlanıyor…')
    let resultMessage = ''
    try { const result = await api.copy(side, paths); resultMessage = result.cancelled ? 'Kopyalamadan vazgeçildi.' : `${result.copied} öğe kopyalandı.` }
    catch (error) { resultMessage = errorMessage(error) }
    finally { setBusy(false) }
    await compare()
    setStatus(`${resultMessage} ${data ? 'Görünüm yenilendi.' : 'Güncel sonuçlar için yeniden karşılaştırın.'}`)
  }
  for (const side of ['left', 'right'] as const) {
    element(`select-${side}`).addEventListener('click', async () => {
      if (busy) return
      setBusy(true)
      try {
        const folder = await api.selectFolder(side)
        if (!folder) return
        if (side === 'left') hasLeft = true; else hasRight = true
        element(`path-${side}`).textContent = folder; element(`path-${side}`).title = folder
        element(`select-${side}`).title = folder
        clearComparison()
        setStatus(hasLeft && hasRight ? 'Klasörler hazır. Karşılaştır düğmesine basın.' : 'Diğer klasörü seçin.')
      } catch (error) { setStatus(errorMessage(error)) }
      finally { setBusy(false) }
    })
    element(`bulk-${side}`).addEventListener('click', () => {
      if (!data) return
      void copyPaths(side, DirDeltaTree.missingPaths(data.rows, side, data.roots.left.startsWith('/') ? '/' : '\\'))
    })
  }
  element('warnings-info').addEventListener('click', () => element<HTMLDialogElement>('warnings-explanation').showModal())
  element('compare').addEventListener('click', () => void compare())
  element('cancel').addEventListener('click', () => { setStatus('İptal ediliyor…'); void api.cancel().catch(error => setStatus(errorMessage(error))) })
  sha256Input.addEventListener('change', () => {
    clearComparison()
    element('mode-description').textContent = sha256Input.checked ? 'İçerik karşılaştırması · Kopyalamada SHA-256 doğrulaması' : 'Hızlı karşılaştırma · yol ve dosya boyutu'
    element('verification').textContent = sha256Input.checked ? 'SHA-256 açık' : 'SHA-256 kapalı'
    setStatus('Karşılaştırma yöntemi değişti. Yeniden karşılaştırın.')
  })
  const searchInput = element<HTMLInputElement>('search')
  searchInput.addEventListener('input', () => { query = searchInput.value.toLocaleLowerCase('tr'); render() })
  let lastProgressAtMilliseconds = 0
  const unsubscribeProgress = api.onProgress(progress => { if (Date.now() - lastProgressAtMilliseconds > progressIntervalMilliseconds) { setStatus(`${progress.phase} · ${progress.count} öğe · ${progress.path}`); lastProgressAtMilliseconds = Date.now() } })
  updateControls()
  window.addEventListener('unload', unsubscribeProgress, { once: true })
})()
