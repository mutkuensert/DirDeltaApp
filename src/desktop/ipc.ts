import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type { DirectorySession } from '../application/session'
import type { Side } from '../types'

function sideValue(value: unknown): Side {
  if (value !== 'left' && value !== 'right') throw new Error('Invalid side.')
  return value
}

export function registerHandlers(window: BrowserWindow, session: DirectorySession) {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {
    'select-folder': side => session.selectFolder(sideValue(side)),
    compare: sha256 => {
      if (typeof sha256 !== 'boolean') throw new Error('Invalid comparison mode.')
      return session.compare(sha256)
    },
    copy: (side, paths) => {
      const key = sideValue(side)
      if (!Array.isArray(paths) || !paths.length || paths.some(p => typeof p !== 'string')) throw new Error('Invalid selection.')
      return session.copy(key, paths)
    },
    cancel: () => session.cancel(),
    reveal: (side, relative) => {
      const key = sideValue(side)
      if (typeof relative !== 'string') throw new Error('Invalid path.')
      return session.reveal(key, relative)
    }
  }
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Invalid sender.')
      return handler(...args)
    })
  }
  return () => {
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel)
  }
}
