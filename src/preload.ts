import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI, Progress } from './types'
const api: DesktopAPI = {
  selectFolder: side => ipcRenderer.invoke('select-folder', side),
  compare: sha256 => ipcRenderer.invoke('compare', sha256),
  copy: (side, paths) => ipcRenderer.invoke('copy', side, paths),
  cancel: () => ipcRenderer.invoke('cancel'),
  reveal: (side, relative) => ipcRenderer.invoke('reveal', side, relative),
  onProgress: callback => {
    const listener = (_event: Electron.IpcRendererEvent, progress: Progress) => callback(progress)
    ipcRenderer.on('progress', listener)
    return () => ipcRenderer.removeListener('progress', listener)
  }
}
contextBridge.exposeInMainWorld('dirdelta', api)
