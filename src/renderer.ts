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
  const sha256Checkbox = element<HTMLInputElement>('sha256')
  function setStatus(message: string) { element('status').textContent = message }
  function updateControls() {
    element<HTMLButtonElement>('compare').disabled = busy || !hasLeft || !hasRight
    element<HTMLButtonElement>('select-left').disabled = busy
    element<HTMLButtonElement>('select-right').disabled = busy
    sha256Checkbox.disabled = busy
    element('cancel').hidden = !busy
    for (const side of ['left', 'right'] as const) element<HTMLButtonElement>(`bulk-${side}`).disabled = busy || !data?.rows.some(row => row.status === `${side}-only`)
    document.querySelectorAll<HTMLButtonElement>('.copy-button,.entry-title').forEach(button => { button.disabled = busy || button.dataset.conflict === 'true' })
  }
  function setBusy(value: boolean) { busy = value; updateControls() }
  function formatError(error: unknown) {
    const text = error instanceof Error ? error.message : String(error)
    return /abort/i.test(text) ? 'Operation cancelled. Completed copies were kept; you can compare again.' : text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
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
      reveal: (side, path) => { void api.reveal(side, path).catch(error => setStatus(formatError(error))) },
      copy: (side, paths) => { void copyPaths(side, paths) }
    })
  }
  function clearComparison() {
    data = undefined
    tree = undefined
    element('warnings').hidden = true
    render()
  }

  async function compare() {
    if (busy || !hasLeft || !hasRight) return
    setBusy(true); setStatus('Starting comparison…')
    clearComparison()
    try {
      data = await api.compare(sha256Checkbox.checked)
      tree = DirDeltaTree.create(data.rows, data.roots.left.startsWith('/') ? '/' : '\\')
      expandedFolders.clear()
      const { failed, skipped } = DirDeltaView.renderWarnings(data.warnings)
      setStatus(`Comparison complete. ${data.rows.length} ${data.rows.length === 1 ? 'item' : 'items'} scanned.${failed ? ' Some items could not be read; results may be incomplete. Review the warnings.' : skipped ? ' Review the information panel for excluded items.' : ''}`)
    } catch (error) { setStatus(formatError(error)) }
    finally { setBusy(false); render() }
  }
  async function copyPaths(side: PanelSide, paths: string[]) {
    if (busy || !data) return
    setBusy(true); setStatus('Preparing to copy…')
    let resultMessage = ''
    try { const result = await api.copy(side, paths); resultMessage = result.cancelled ? 'Copy cancelled.' : `${result.copied} ${result.copied === 1 ? 'item' : 'items'} copied.` }
    catch (error) { resultMessage = formatError(error) }
    finally { setBusy(false) }
    await compare()
    setStatus(`${resultMessage} ${data ? 'View refreshed.' : 'Compare again for up-to-date results.'}`)
  }
  async function selectFolder(side: PanelSide) {
    if (busy) return
    setBusy(true)
    try {
      const folder = await api.selectFolder(side)
      if (!folder) return
      if (side === 'left') hasLeft = true; else hasRight = true
      element(`path-${side}`).textContent = folder; element(`path-${side}`).title = folder
      element(`select-${side}`).title = folder
      clearComparison()
      setStatus(hasLeft && hasRight ? 'Folders are ready. Click Compare.' : 'Select the other folder.')
    } catch (error) { setStatus(formatError(error)) }
    finally { setBusy(false) }
  }

  for (const side of ['left', 'right'] as const) {
    element(`select-${side}`).addEventListener('click', () => void selectFolder(side))
    element(`bulk-${side}`).addEventListener('click', () => {
      if (!data) return
      void copyPaths(side, DirDeltaTree.missingPaths(data.rows, side, data.roots.left.startsWith('/') ? '/' : '\\'))
    })
  }
  element('warnings-info').addEventListener('click', () => element<HTMLDialogElement>('warnings-explanation').showModal())
  element('compare').addEventListener('click', () => void compare())
  element('cancel').addEventListener('click', () => { setStatus('Cancelling…'); void api.cancel().catch(error => setStatus(formatError(error))) })
  sha256Checkbox.addEventListener('change', () => {
    clearComparison()
    element('mode-description').textContent = sha256Checkbox.checked ? 'Content comparison · SHA-256 verification when copying' : 'Quick comparison · path and file size'
    element('verification').textContent = sha256Checkbox.checked ? 'SHA-256 enabled' : 'SHA-256 disabled'
    setStatus('Comparison mode changed. Compare again.')
  })
  const search = element<HTMLInputElement>('search')
  search.addEventListener('input', () => { query = search.value.toLocaleLowerCase('en'); render() })
  const progressIntervalMilliseconds = 70
  let lastProgress = 0
  const unsubscribeProgress = api.onProgress(progress => { if (Date.now() - lastProgress > progressIntervalMilliseconds) { setStatus(`${progress.phase} · ${progress.count} ${progress.count === 1 ? 'item' : 'items'} · ${progress.path}`); lastProgress = Date.now() } })
  updateControls()
  window.addEventListener('unload', unsubscribeProgress, { once: true })
})()
