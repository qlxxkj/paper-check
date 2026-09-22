import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    importFiles: (filePaths: string[]) => ipcRenderer.invoke('import-files', filePaths),
    importFolder: (folderPath: string) => ipcRenderer.invoke('import-folder', folderPath),
    importMixed: (paths: string[]) => ipcRenderer.invoke('import-mixed', paths),
    onImportProgress: (callback: (data: any) => void) => {
        const listener = (_: any, data: any) => callback(data);
        ipcRenderer.on('import-progress', listener);
        // 返回取消函数，供组件卸载/重新订阅时使用
        return () => { ipcRenderer.removeListener('import-progress', listener); };
    },
    getAllDocs: () => ipcRenderer.invoke('get-all-docs'),
    backupDB: () => ipcRenderer.invoke('backup-db'),
    restoreDB: (path: string) => ipcRenderer.invoke('restore-db', path),
    clearAll: () => ipcRenderer.invoke('clear-all'),
    rebuildNGramIndex: () => ipcRenderer.invoke('rebuild-ngram-index'),
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

    getParagraphContext: (docId: number, paraIndex: number, contextSize?: number) =>
        ipcRenderer.invoke('get-paragraph-context', docId, paraIndex, contextSize),

    getCheckLogs: () => ipcRenderer.invoke('get-check-logs'),

    getConfig: () => ipcRenderer.invoke('getConfig'),
    saveConfig: (config: any) => ipcRenderer.invoke('saveConfig', config),

    importLegacyFolder: (folderPath: string) => ipcRenderer.invoke('import-legacy-folder', folderPath),
});