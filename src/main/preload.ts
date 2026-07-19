import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    importFiles: (filePaths: string[]) => ipcRenderer.invoke('import-files', filePaths),
    importFolder: (folderPath: string) => ipcRenderer.invoke('import-folder', folderPath),
    importMixed: (paths: string[]) => ipcRenderer.invoke('import-mixed', paths),
    onImportProgress: (callback: (data: any) => void) => {
        ipcRenderer.on('import-progress', (_, data) => callback(data));
    },
    getAllDocs: () => ipcRenderer.invoke('get-all-docs'),
    backupDB: () => ipcRenderer.invoke('backup-db'),
    restoreDB: (path: string) => ipcRenderer.invoke('restore-db', path),
    clearAll: () => ipcRenderer.invoke('clear-all'),
    openFileDialog: (options?: { properties?: string[] }) => ipcRenderer.invoke('open-file-dialog', options),
    getDocParagraphs: (docId: number) => ipcRenderer.invoke('get-doc-paragraphs', docId),
    getRepeatRelations: (docId: number) => ipcRenderer.invoke('get-repeat-relations', docId),
    getDuplicateParagraphs: (docId1: number, docId2: number) => ipcRenderer.invoke('get-duplicate-paragraphs', docId1, docId2),
    exportDocsZip: (docIds: number[]) => ipcRenderer.invoke('export-docs-zip', docIds),
    openDoc: (filePath: string) => ipcRenderer.invoke('open-doc', filePath),
    deleteDoc: (docId: number) => ipcRenderer.invoke('delete-doc', docId),
    batchDelete: (docIds: number[]) => ipcRenderer.invoke('batch-delete', docIds),
    batchMarkSource: (docIds: number[]) => ipcRenderer.invoke('batch-mark-source', docIds),
    exportDataZip: (docIds: number[]) => ipcRenderer.invoke('export-data-zip', docIds),

    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    installUpdate: () => ipcRenderer.send('install-update'),
    onUpdateStatus: (callback: (status: string) => void) => {
        ipcRenderer.on('update-status', (_, status) => callback(status));
    },
    onUpdateProgress: (callback: (progress: any) => void) => {
        ipcRenderer.on('update-progress', (_, progress) => callback(progress));
    },
});