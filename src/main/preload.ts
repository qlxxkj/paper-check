import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  importFiles: (filePaths: string[]) => ipcRenderer.invoke('import-files', filePaths),
  onImportProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('import-progress', (_, data) => callback(data));
  },
  getSourceDocs: () => ipcRenderer.invoke('get-source-docs'),
  backupDB: () => ipcRenderer.invoke('backup-db'),
  restoreDB: (path: string) => ipcRenderer.invoke('restore-db', path),
  clearAll: () => ipcRenderer.invoke('clear-all')
});