import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI } from './types'
const api: DesktopAPI = {
  selectFolder: side => ipcRenderer.invoke('select-folder', side),
  compare: sha256 => ipcRenderer.invoke('compare', sha256),
  copy: (side, paths) => ipcRenderer.invoke('copy', side, paths),
  cancel: () => ipcRenderer.invoke('cancel'),
  reveal: (side, relative) => ipcRenderer.invoke('reveal', side, relative),
  onProgress: callback => { ipcRenderer.removeAllListeners('progress'); ipcRenderer.on('progress', (_event, progress) => callback(progress)) }
}
contextBridge.exposeInMainWorld('dirdelta', api)
