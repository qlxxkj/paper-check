// 统一 API 适配层：Wails 绑定（window.go.main.App）+ 事件（window.runtime.EventsOn）
// 前端各页面只需 import { api } from '../api'，无需关心底层是 Wails 还是 Electron。

declare global {
    interface Window {
        go: any;
        runtime: any;
    }
}

type ProgressEvent = {
    type: string;
    file?: string;
    status?: string;
    reason?: string;
    error?: string;
    docId?: number;
    repeatRate?: number;
    isSource?: boolean;
    repeatParaCount?: number;
    index?: number;
    total?: number;
    success?: number;
    failed?: number;
    skipped?: number;
};

function go() {
    // Wails 把 main 包的 App 结构体方法挂在 window.go.main.App 下
    return window.go?.main?.App;
}

// 获取所有文档（get-all-docs）
export function getAllDocs(): Promise<any[]> {
    return go().GetAllDocs();
}

// 导入文件（import-files）
export function importFiles(paths: string[]): Promise<{ success: number; failed: number; skipped: number }> {
    return go().ImportFiles(paths);
}

// 混合导入（import-mixed）
export function importMixed(paths: string[]): Promise<{ success: number; failed: number; skipped: number }> {
    return go().ImportMixed(paths);
}

// 存量导入文件夹（import-legacy-folder）
export function importLegacyFolder(path: string): Promise<any[]> {
    return go().ImportLegacyFolder(path);
}

// 打开文件对话框（open-file-dialog）
export function openFileDialog(): Promise<string[]> {
    return go().OpenFileDialog();
}

// 备份数据库（backup-db）
export function backupDB(): Promise<{ success: boolean; canceled?: boolean; error?: string }> {
    return go().BackupDB();
}

// 清空全部（clear-all）
export function clearAll(): Promise<boolean> {
    return go().ClearAll();
}

// 重建 N-gram 索引（rebuild-ngram-index）
export function rebuildNGramIndex(): Promise<{ rebuilt: number; skipped: number }> {
    return go().RebuildNGramIndex();
}

// 文档段落（get-doc-paragraphs）
export function getDocParagraphs(docId: number): Promise<any[]> {
    return go().GetDocParagraphs(docId);
}

// 重复关系（get-repeat-relations）
export function getRepeatRelations(docId: number): Promise<any[]> {
    return go().GetRepeatRelations(docId);
}

// 重复段落 Diff（get-duplicate-paragraphs）
export function getDuplicateParagraphs(docId1: number, docId2: number): Promise<any[]> {
    return go().GetDuplicateParagraphs(docId1, docId2);
}

// 导出文档 zip（export-docs-zip）
export function exportDocsZip(docIds: number[]): Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }> {
    return go().ExportDocsZip(docIds);
}

// 打开文档（open-doc）
export function openDoc(filePath: string): Promise<{ success: boolean; error?: string }> {
    return go().OpenDoc(filePath);
}

// 删除文档（delete-doc）
export function deleteDoc(docId: number): Promise<boolean> {
    return go().DeleteDoc(docId);
}

// 批量删除（batch-delete）
export function batchDelete(docIds: number[]): Promise<{ successCount: number; failCount: number }> {
    return go().BatchDelete(docIds);
}

// 批量标记源（batch-mark-source）
export function batchMarkSource(docIds: number[]): Promise<{ success: boolean; error?: string }> {
    return go().BatchMarkSource(docIds);
}

// 导出数据（export-data-zip）
export function exportDataZip(docIds: number[]): Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }> {
    return go().ExportDataZip(docIds);
}

// 获取配置（getConfig）
export function getConfig(): Promise<any> {
    return go().GetConfig();
}

// 保存配置（saveConfig）
export function saveConfig(cfg: any): Promise<{ success: boolean; error?: string }> {
    return go().SaveConfig(cfg);
}

// 获取检查日志（get-check-logs）
export function getCheckLogs(): Promise<any[]> {
    return go().GetCheckLogs();
}

// 段落上下文（get-paragraph-context）
export function getParagraphContext(docId: number, paraIndex: number, contextSize?: number): Promise<any[]> {
    return go().GetParagraphContext(docId, paraIndex, contextSize ?? 3);
}

// 监听导入进度事件（import-progress）
export function onImportProgress(callback: (data: ProgressEvent) => void): () => void {
    const handler = (_event: any, data: ProgressEvent) => callback(data);
    window.runtime.EventsOn('import-progress', handler);
    return () => {
        window.runtime.EventsOff('import-progress', handler);
    };
}

// ====== 自动更新：Wails 无官方 updater，原 electron-updater 逻辑全部移除 ======
// DocumentManager 里 updateBox UI 已删除，这里不再提供 checkForUpdates/installUpdate/onUpdateStatus/onUpdateProgress
