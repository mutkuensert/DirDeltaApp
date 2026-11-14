// End-to-end smoke check using the real renderer, preload and IPC handlers.
const { app, BrowserWindow, dialog } = require('electron')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
let root
app.whenReady().then(async () => {
  try {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'dirdelta-ui-')))
    const left = path.join(root, 'left'), right = path.join(root, 'right')
    await fs.mkdir(left); await fs.mkdir(right)
    await fs.writeFile(path.join(left, 'hello.txt'), 'hello')
    await fs.writeFile(path.join(left, 'changed.txt'), 'left!')
    await fs.writeFile(path.join(right, 'changed.txt'), 'right')
    await fs.mkdir(path.join(left, 'bundle/nested'), { recursive: true })
    await fs.mkdir(path.join(left, 'bundle/empty'))
    await fs.writeFile(path.join(left, 'bundle/nested/needle.txt'), 'nested content')
    let selection = 0
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selection++ ? right : left] })
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    require('../dist/main.js')
    let win
    const deadline = Date.now() + 20000
    while (!(win = BrowserWindow.getAllWindows()[0])) {
      if (Date.now() > deadline) throw new Error('Window did not open')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    await new Promise(resolve => { if (!win.webContents.isLoading()) resolve(); else win.webContents.once('did-finish-load', resolve) })
    const run = code => win.webContents.executeJavaScript(code)
    const wait = async expression => {
      while (!await run(expression)) {
        if (Date.now() > deadline) throw new Error(`Timed out: ${expression}`)
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
    await run("document.getElementById('select-left').click()")
    await wait("!document.getElementById('select-left').disabled")
    await run("document.getElementById('select-right').click()")
    await wait("!document.getElementById('compare').disabled")
    await run("document.getElementById('sha256').click(); document.getElementById('compare').click()")
    await wait("document.querySelectorAll('.result-row').length === 3 && !document.getElementById('compare').disabled")
    if (await run("document.getElementById('stat-different').textContent") !== '1') throw new Error('Hash status failed')
    await run("document.querySelector('[data-path=\"bundle\"] .entry-title').click()")
    await wait("document.querySelectorAll('.result-row').length === 5")
    await run("document.querySelectorAll('[data-path]')[2].querySelector('.entry-title').click()")
    await wait("document.querySelectorAll('.result-row').length === 6")
    await run("document.querySelector('[data-path=\"bundle\"] .entry-title').click()")
    await wait("document.querySelectorAll('.result-row').length === 3")
    await run("document.getElementById('search').value = 'needle'; document.getElementById('search').dispatchEvent(new Event('input'))")
    await wait("document.querySelectorAll('.result-row').length === 3 && document.querySelectorAll('.entry-title')[2].textContent.includes('needle')")
    await run("document.getElementById('search').value = ''; document.getElementById('search').dispatchEvent(new Event('input'))")
    await run("document.querySelector('[data-path=\"bundle\"] .copy-button').click()")
    await wait("document.getElementById('stat-left').textContent === '1' && !document.getElementById('compare').disabled")
    if (await fs.readFile(path.join(right, 'bundle/nested/needle.txt'), 'utf8') !== 'nested content') throw new Error('Collapsed folder copy failed')
    await run("document.getElementById('bulk-left').click()")
    await wait("document.getElementById('stat-left').textContent === '0' && !document.getElementById('compare').disabled")
    if (await fs.readFile(path.join(right, 'hello.txt'), 'utf8') !== 'hello') throw new Error('Copy failed')
    await run("document.getElementById('search').value = 'changed'; document.getElementById('search').dispatchEvent(new Event('input'))")
    await wait("document.querySelectorAll('.result-row').length === 1")
    await run("document.querySelectorAll('.result-row .copy-button')[1].click()")
    await wait("document.getElementById('stat-different').textContent === '0' && !document.getElementById('compare').disabled")
    if (await fs.readFile(path.join(left, 'changed.txt'), 'utf8') !== 'right') throw new Error('Per-row reverse copy failed')
    await new Promise(resolve => setTimeout(resolve, 300))
    const screenshot = path.join(root, 'screenshot.png')
    await fs.writeFile(screenshot, (await win.webContents.capturePage()).toPNG())
    console.log(`UI smoke passed: folder selection, SHA-256, aligned results, bulk copy, refresh, nested expansion, collapsed folder copy, search, per-row reverse copy and overwrite confirmation. Screenshot: ${screenshot}`)
    app.exit(0)
  } catch (error) { console.error(error); app.exit(1) }
})
