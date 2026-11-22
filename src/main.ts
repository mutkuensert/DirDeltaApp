import { app, BrowserWindow, dialog, shell } from 'electron'
import * as path from 'node:path'
import * as directories from './engine'
import { DirectorySession } from './application/session'
import { registerHandlers } from './desktop/ipc'

function createWindow() {
  const window = new BrowserWindow({
    width: 1400, height: 920, minWidth: 1000, minHeight: 680,
    backgroundColor: '#101319', title: 'DirDelta',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  })
  const progressIntervalMilliseconds = 60
  let lastProgress = 0
  const session = new DirectorySession(directories, {
    async selectFolder(side, current) {
      const result = await dialog.showOpenDialog(window, {
        title: side === 'left' ? 'Select the left folder' : 'Select the right folder',
        properties: ['openDirectory'], defaultPath: current
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
    async confirmOverwrite(comparison, side, items) {
      const result = await dialog.showMessageBox(window, {
        type: 'warning', title: 'Overwrite files?',
        message: `${items.length} ${items.length === 1 ? 'file' : 'files'} will be overwritten.`,
        detail: `Source: ${comparison.roots[side]}\nDestination: ${comparison.roots[side === 'left' ? 'right' : 'left']}\n\n${items.slice(0, 8).map(item => item.relative).join('\n')}\n\nThis operation cannot be undone.`,
        buttons: ['Cancel', 'Overwrite'], defaultId: 0, cancelId: 0, noLink: true
      })
      return result.response === 1
    },
    reveal: absolute => shell.showItemInFolder(absolute),
    progress(value) {
      if (Date.now() - lastProgress < progressIntervalMilliseconds || window.isDestroyed()) return
      lastProgress = Date.now()
      window.webContents.send('progress', value)
    }
  })
  const unregister = registerHandlers(window, session)
  window.setMenuBarVisibility(false)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.on('closed', () => { session.dispose(); unregister() })
  void window.loadFile(path.join(__dirname, '../index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
