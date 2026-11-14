import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import * as path from 'node:path'
import { compareDirectories, executeCopy, planCopy, safePath } from './engine'
import type { Comparison, Progress, Side } from './types'

let win: BrowserWindow | null = null
let roots: Partial<Record<Side, string>> = {}
let comparison: Comparison | undefined
let operation: AbortController | undefined
function sideValue(value: unknown): Side { if (value !== 'left' && value !== 'right') throw new Error('Geçersiz taraf.'); return value }
let lastProgress = 0
function progress(p: Progress) { if (Date.now() - lastProgress < 60) return; lastProgress = Date.now(); if (win && !win.isDestroyed()) win.webContents.send('progress', p) }
function idle() { if (operation) throw new Error('Devam eden işlemin bitmesini bekleyin.') }
function createWindow() {
  win = new BrowserWindow({ width: 1400, height: 920, minWidth: 1000, minHeight: 680, backgroundColor: '#101319', title: 'DirDelta', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  win.setMenuBarVisibility(false)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', event => event.preventDefault())
  win.on('closed', () => { operation?.abort(); win = null; comparison = undefined; roots = {} })
  void win.loadFile(path.join(__dirname, '../index.html'))
}
app.whenReady().then(() => {
  ipcMain.handle('select-folder', async (_event, side: unknown) => {
    idle(); const key = sideValue(side)
    const result = await dialog.showOpenDialog(win!, { title: key === 'left' ? 'Sol klasörü seç' : 'Sağ klasörü seç', properties: ['openDirectory'], defaultPath: roots[key] })
    if (result.canceled) return null
    roots[key] = result.filePaths[0]; comparison = undefined
    return roots[key]
  })
  ipcMain.handle('compare', async (_event, sha256: unknown) => {
    idle()
    if (!roots.left || !roots.right) throw new Error('Önce iki klasör seçin.')
    operation = new AbortController(); comparison = undefined
    try { comparison = await compareDirectories(roots.left, roots.right, sha256 === true, operation.signal, progress); return comparison }
    finally { operation = undefined }
  })
  ipcMain.handle('copy', async (_event, side: unknown, paths: unknown) => {
    idle(); const key = sideValue(side)
    if (!comparison) throw new Error('Önce klasörleri karşılaştırın.')
    if (!Array.isArray(paths) || !paths.length || paths.some(p => typeof p !== 'string')) throw new Error('Geçersiz seçim.')
    operation = new AbortController()
    const current = comparison
    try {
      const items = await planCopy(current, key, paths)
      const overwrites = items.filter(item => item.kind === 'file' && item.exists).length
      if (overwrites > 0) {
        const result = await dialog.showMessageBox(win!, { type: 'warning', title: 'Dosyaların üzerine yazılsın mı?', message: `${overwrites} dosyanın üzerine yazılacak.`, detail: `Kaynak: ${current.roots[key]}\nHedef: ${current.roots[key === 'left' ? 'right' : 'left']}\n\n${items.filter(i => i.exists && i.kind === 'file').slice(0, 8).map(i => i.relative).join('\n')}\n\nBu işlem geri alınamaz.`, buttons: ['Vazgeç', 'Üzerine yaz'], defaultId: 0, cancelId: 0, noLink: true })
        if (result.response !== 1) return { copied: 0, cancelled: true }
      }
      const copied = await executeCopy(current, key, items, overwrites > 0, operation.signal, progress)
      return { copied, cancelled: false }
    } finally { comparison = undefined; operation = undefined }
  })
  ipcMain.handle('cancel', () => { operation?.abort(); return undefined })
  ipcMain.handle('reveal', async (_event, side: unknown, relative: unknown) => {
    const key = sideValue(side)
    if (!roots[key] || typeof relative !== 'string') throw new Error('Geçersiz yol.')
    const root = comparison?.roots[key]
    if (!root) throw new Error('Önce karşılaştırma yapın.')
    shell.showItemInFolder(await safePath(root, relative))
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
