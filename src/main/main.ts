import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { setDBPath, initDB, getDB } from './database/db';
import { importFilesHandler } from './handlers/importHandler';
import {
    getSourceDocs,
    deleteAllData,
    getAllDocs,
    getParagraphsByDoc,
    deleteDoc,
    markDocsAsSource,
} from './database/models';
import { backupDB, restoreDB } from './backup/backupRestore';
import { DiffResult } from './dedup/diffComparator';
import { autoUpdater } from 'electron-updater';  //自动更新

// main.ts 顶部
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

// 计算数据库路径
function getDatabasePath(): string {
    if (app.isPackaged) {
        // 打包后：使用 userData 目录，确保可写
        return path.join(app.getPath('userData'), 'databases', 'app.db');
    } else {
        // 开发环境：项目根目录下的 databases/app.db
        return path.join(__dirname, '../../databases/app.db');
    }
}

let mainWindow: BrowserWindow | null = null;

function getIconPath(): string {
    const iconName = 'icon.ico';
    if (app.isPackaged) {
        // 打包后，resources 目录位于 process.resourcesPath
        // 您的 resources 文件夹在打包时会被复制到 resources/app/resources
        // 但更保险的方式是使用 app.getAppPath() 获取应用根目录
        const appPath = app.getAppPath(); // 在打包后返回 app.asar 路径
        const resourcePath = path.join(path.dirname(appPath), 'resources');
        const iconFullPath = path.join(resourcePath, iconName);
        if (fs.existsSync(iconFullPath)) {
            return iconFullPath;
        }
        // 备选：process.resourcesPath
        return path.join(process.resourcesPath, 'resources', iconName);
    } else {
        // 开发环境：从项目根目录读取
        return path.join(__dirname, '../resources', iconName);
    }
}

function createWindow() {
    Menu.setApplicationMenu(null);

    // const iconPath = app.isPackaged
    //     ? path.join(process.resourcesPath, 'resources/icon.ico')
    //     : path.join(__dirname, '../resources/icon.ico');
    const iconPath = getIconPath();

    console.log('Icon path:', iconPath);

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // mainWindow.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    // mainWindow.webContents.openDevTools(); //打开开发者工具
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.disableHardwareAcceleration();


/////////////////////
//
//  自动更新
//
/////////////////////

// 更新相关状态
let updateDownloaded = false;

// 自动更新函数
function setupAutoUpdater() {
    // 检查更新（应用启动后可以调用）
    autoUpdater.checkForUpdatesAndNotify();

    // 监听更新事件
    autoUpdater.on('checking-for-update', () => {
        console.log('检查更新中...');
    });

    autoUpdater.on('update-available', (info) => {
        console.log('发现新版本:', info.version);
        mainWindow?.webContents.send('update-status', '发现新版本，正在下载...');
    });

    autoUpdater.on('update-not-available', (info) => {
        console.log('当前已是最新版本:', info.version);
    });

    autoUpdater.on('download-progress', (progressObj) => {
        let logMessage = `下载速度: ${progressObj.bytesPerSecond} - 已下载 ${progressObj.percent}%`;
        console.log(logMessage);
        mainWindow?.webContents.send('update-progress', progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('更新下载完成:', info.version);
        updateDownloaded = true;
        mainWindow?.webContents.send('update-status', '更新下载完成，点击重启安装');
    });

    // ==================== 错误处理（重点修改） ====================
    autoUpdater.on('error', (err) => {
        // 1. 控制台只输出简短的描述，不显示堆栈或完整对象
        console.error(`[更新] 检查更新失败: ${err.message || '未知错误'}`);

        // 2. 向用户发送友好的提示（不暴露技术细节）
        const userMessage = '检查更新失败，请稍后重试或检查网络连接。';
        mainWindow?.webContents.send('update-status', userMessage);

        // 可选：如果你需要记录详细日志到文件（仅用于开发者调试），可以单独写日志文件
        // 但这里我们不将详细错误发送到渲染进程
    });
}


app.whenReady().then(() => {
    const dbPath = getDatabasePath();
    console.log('[Main] 数据库路径:', dbPath);
    setDBPath(dbPath);
    initDB();
    createWindow();
    setupAutoUpdater(); //自动更新注册
    registerIpcHandlers();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC 通信：渲染进程请求检查更新
ipcMain.on('check-for-updates', () => {
    autoUpdater.checkForUpdatesAndNotify();
});

// IPC 通信：渲染进程请求安装更新
ipcMain.on('install-update', () => {
    if (updateDownloaded) {
        autoUpdater.quitAndInstall(); // 退出应用并安装更新
    }
});

// 递归获取文件夹下所有 .docx/.doc 文件
function getAllWordFiles(dir: string): string[] {
    let results: string[] = [];
    try {
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                results = results.concat(getAllWordFiles(fullPath));
            } else if (
                file.endsWith('.docx') ||
                file.endsWith('.doc') ||
                file.endsWith('.pdf')
            ) {
                results.push(fullPath);
            }
        }
    } catch (err) {
        console.error('读取文件夹失败:', err);
    }
    return results;
}

// 计算两个文档之间的重复率（返回重复段落数、重复字数和重复率）
function computePairRepeatRate(
    docId1: number,
    docId2: number
): { repeatParaCount: number; repeatWordCount: number; pairRepeatRate: number } {
    const db = getDB();
    const stmt = db.prepare('SELECT ParaHash, Length FROM Paragraph WHERE DocID = ? ORDER BY ParaIndex');
    const paras1 = stmt.all(docId1) as { ParaHash: string; Length: number }[];
    const paras2 = stmt.all(docId2) as { ParaHash: string; Length: number }[];
    const hashSet2 = new Set(paras2.map((p) => p.ParaHash));
    let repeatWordCount = 0;
    let repeatParaCount = 0;
    for (const p of paras1) {
        if (hashSet2.has(p.ParaHash)) {
            repeatWordCount += p.Length;
            repeatParaCount++;
        }
    }
    const totalWordCount = paras1.reduce((sum, p) => sum + p.Length, 0);
    const pairRepeatRate = totalWordCount > 0 ? repeatWordCount / totalWordCount : 0;
    return { repeatParaCount, repeatWordCount, pairRepeatRate };
}

// 读取配置文件（放在 registerIpcHandlers 之前）
let appConfig: any = {};
try {
    // 开发环境：项目根目录/config/config.json
    // 打包后：与 app.asar 同级 resources/app/config/config.json
    const configPath = process.env.NODE_ENV === 'production'
        ? path.join(process.resourcesPath, 'app', 'config', 'config.json')
        : path.join(__dirname, '../config/config.json');

    console.log('[Config] 尝试读取:', configPath);
    const configContent = fs.readFileSync(configPath, 'utf-8');
    appConfig = JSON.parse(configContent);
    console.log('[Config] 加载配置成功:', appConfig);
} catch (err) {
    console.error('[Config] 加载配置失败，使用默认值:', err);
    // 默认值
    appConfig = {
        fullDuplicateThreshold: 0.995,
        partialDuplicateThreshold: 0.01,
        diffThreshold: 0.01,
        ngramLength: 16,
        minMatchChars: 13,
        sensitivity: 0.05,
        enableRefFilter: true,
        minSharedNgrams: 5,   // 默认值
        contextSize: 3        // 上下文引用范围默认值
    };
    console.warn('[Config] 使用默认配置:', appConfig);
}

// 注册handlers

function registerIpcHandlers() {

    ipcMain.handle('save-file-dialog', async (event, options) => {
        const result = await dialog.showSaveDialog(mainWindow!, {
            defaultPath: options?.defaultPath || '导出数据.csv',
            filters: options?.filters || [{ name: 'CSV 文件', extensions: ['csv'] }],
        });
        return result;
    });

    ipcMain.handle('get-all-docs', async () => {
        return getAllDocs();
    });

    ipcMain.handle('open-file-dialog', async (event, options) => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: options?.properties || ['openFile', 'multiSelections'],
            filters: [
                { name: 'Word 文档', extensions: ['docx', 'doc', 'pdf'] }
            ],
        });
        return result;
    });

    ipcMain.handle('import-files', async (event, filePaths: string[]) => {
        const dbPath = getDatabasePath();
        return importFilesHandler(filePaths, (progress) => {
            event.sender.send('import-progress', progress);
        }, appConfig, dbPath).then(async (result) => {
            // 写入操作日志
            const { insertCheckLog } = require('./database/models');
            insertCheckLog({
                ExecTime: new Date().toISOString(),
                TotalFiles: (result as any).success + (result as any).failed,
                SuccessCount: (result as any).success,
                FailedCount: (result as any).failed,
                SkippedCount: (result as any).skipped,
                FileList: JSON.stringify(filePaths),
                Details: '导入文件',
            });
            return result;
        });
    });

    ipcMain.handle('import-folder', async (event, folderPath: string) => {
        const files = getAllWordFiles(folderPath);
        if (files.length === 0) {
            return { success: 0, failed: 0, skipped: 0, message: '该文件夹下没有 Word 文档' };
        }
        const dbPath = getDatabasePath();
        return importFilesHandler(files, (progress) => {
            event.sender.send('import-progress', progress);
        }, appConfig, dbPath).then(async (result) => {
            const { insertCheckLog } = require('./database/models');
            insertCheckLog({
                ExecTime: new Date().toISOString(),
                TotalFiles: (result as any).success + (result as any).failed,
                SuccessCount: (result as any).success,
                FailedCount: (result as any).failed,
                SkippedCount: (result as any).skipped,
                FileList: JSON.stringify(files),
                Details: '导入文件夹',
            });
            return result;
        });
    });

    ipcMain.handle('import-mixed', async (event, paths: string[]) => {
        const allFiles: string[] = [];
        for (const p of paths) {
            try {
                const stat = fs.statSync(p);
                if (stat.isDirectory()) {
                    const files = getAllWordFiles(p);
                    allFiles.push(...files);
                } else if (stat.isFile() && (p.endsWith('.docx') || p.endsWith('.doc') || p.endsWith('.pdf'))) {
                    allFiles.push(p);
                }
            } catch (err) {
                console.error('处理路径失败:', p, err);
            }
        }
        if (allFiles.length === 0) {
            return { success: 0, failed: 0, skipped: 0, message: '没有找到 Word 文档' };
        }
        const dbPath = getDatabasePath();
        return importFilesHandler(allFiles, (progress) => {
            event.sender.send('import-progress', progress);
        }, appConfig, dbPath).then(async (result) => {
            const { insertCheckLog } = require('./database/models');
            insertCheckLog({
                ExecTime: new Date().toISOString(),
                TotalFiles: (result as any).success + (result as any).failed,
                SuccessCount: (result as any).success,
                FailedCount: (result as any).failed,
                SkippedCount: (result as any).skipped,
                FileList: JSON.stringify(allFiles),
                Details: '批量导入',
            });
            return result;
        });
    });

    ipcMain.handle('get-source-docs', async () => {
        return getSourceDocs();
    });

    ipcMain.handle('backup-db', async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openDirectory'],
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return backupDB(result.filePaths[0]);
        }
        return false;
    });

    ipcMain.handle('restore-db', async (_, backupPath: string) => {
        return restoreDB(backupPath);
    });

    ipcMain.handle('clear-all', async () => {
        return deleteAllData();
    });

    // 重建所有文档的 N-gram 索引（用于 ngramLength 变更后的数据修复）
    ipcMain.handle('rebuild-ngram-index', async () => {
        const { rebuildNGramIndex } = require('./database/models');
        return rebuildNGramIndex(appConfig.ngramLength || 16);
    });

    ipcMain.handle('export-docs-zip', async (event, docIds: number[]) => {
        try {
            const db = getDB();
            const placeholders = docIds.map(() => '?').join(',');
            const stmt = db.prepare(
                `SELECT FilePath, FileName FROM Document WHERE DocID IN (${placeholders}) AND IsSource = 1`
            );
            const rows = stmt.all(...docIds) as { FilePath: string; FileName: string }[];
            if (rows.length === 0) {
                throw new Error('没有找到可导出的源文档');
            }
            const zip = new AdmZip();
            for (const row of rows) {
                if (fs.existsSync(row.FilePath)) {
                    zip.addLocalFile(row.FilePath, undefined, row.FileName);
                } else {
                    console.warn('文件不存在:', row.FilePath);
                }
            }
            const zipBuffer = zip.toBuffer();
            const result = await dialog.showSaveDialog(mainWindow!, {
                defaultPath: `文档导出_${new Date().toISOString().slice(0, 10)}.zip`,
                filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
            });
            if (!result.canceled && result.filePath) {
                fs.writeFileSync(result.filePath, zipBuffer);
                return { success: true, path: result.filePath };
            } else {
                return { success: false, canceled: true };
            }
        } catch (err) {
            console.error(err);
            throw err;
        }
    });

    ipcMain.handle('get-doc-paragraphs', async (_, docId: number) => {
        return getParagraphsByDoc(docId);
    });


    // 获取重复关系：计算两两重复率，并按重复率降序排列
    ipcMain.handle('get-repeat-relations', async (_, docId: number) => {
        const db = getDB();
        const minSharedNgrams = appConfig.minSharedNgrams || 5;
        // 获取当前文档的所有 N-gram
        const ngramStmt = db.prepare('SELECT DISTINCT ngram FROM NGramIndex WHERE DocID = ?');
        const ngramRows = ngramStmt.all(docId) as { ngram: string }[];
        if (ngramRows.length === 0) return [];
        const ngrams = ngramRows.map(r => r.ngram);
        const placeholders = ngrams.map(() => '?').join(',');
        const stmt = db.prepare(`
        SELECT DISTINCT d.DocID, d.FileName, d.RepeatRate, d.RepeatStatus
        FROM Document d
        INNER JOIN NGramIndex idx ON d.DocID = idx.DocID
        WHERE idx.ngram IN (${placeholders})
          AND d.DocID != ?
        GROUP BY d.DocID
        HAVING COUNT(DISTINCT idx.ngram) >= ${minSharedNgrams}
        ORDER BY d.CreateTime ASC
    `);
        console.log('[get-repeat-relations] minSharedNgrams =', minSharedNgrams);
        const rows = stmt.all(...ngrams, docId) as { DocID: number; FileName: string; RepeatRate: number; RepeatStatus: number }[];
        if (rows.length === 0) return [];

        // 批量获取所有相关文档的段落哈希，单次查询代替 N 次查询
        const targetDocIds = rows.map(r => r.DocID);
        const placeholders2 = targetDocIds.map(() => '?').join(',');
        const paraStmt = db.prepare(`
            SELECT DocID, ParaHash, Length FROM Paragraph
            WHERE DocID IN (${placeholders2})
        `);
        const allParas = paraStmt.all(...targetDocIds) as { DocID: number; ParaHash: string; Length: number }[];

        // 按 DocID 分组
        const paraByDoc = new Map<number, { hash: string; length: number }[]>();
        for (const p of allParas) {
            if (!paraByDoc.has(p.DocID)) paraByDoc.set(p.DocID, []);
            paraByDoc.get(p.DocID)!.push({ hash: p.ParaHash, length: p.Length });
        }

        // 当前文档的段落
        const currentParaStmt = db.prepare('SELECT ParaHash, Length FROM Paragraph WHERE DocID = ?');
        const currentParas = currentParaStmt.all(docId) as { ParaHash: string; Length: number }[];

        // 在内存中计算重复率，避免 N 次 DB 查询
        const results = rows.map(row => {
            try {
                const targetParas = paraByDoc.get(row.DocID) || [];
                const targetHashSet = new Set(targetParas.map(p => p.hash));
                let repeatWordCount = 0;
                let repeatParaCount = 0;
                for (const p of currentParas) {
                    if (targetHashSet.has(p.ParaHash)) {
                        repeatWordCount += p.Length;
                        repeatParaCount++;
                    }
                }
                const totalWordCount = currentParas.reduce((s, p) => s + p.Length, 0);
                const pairRepeatRate = totalWordCount > 0 ? repeatWordCount / totalWordCount : 0;
                return {
                    ...row,
                    pairRepeatRate,
                    duplicateParagraphCount: repeatParaCount,
                };
            } catch {
                return { ...row, pairRepeatRate: 0, duplicateParagraphCount: 0 };
            }
        });

        // 按重复率降序排列，优先显示最相似的对比文档
        results.sort((a, b) => (b.pairRepeatRate || 0) - (a.pairRepeatRate || 0));
        return results;
    });


    // 获取两个文档的 Diff 高亮结果（优先从缓存读取，否则实时计算）
    ipcMain.handle('get-duplicate-paragraphs', async (_, docId1: number, docId2: number) => {
        const db = getDB();
        try {
            // 1. 按给定顺序查缓存
            let stmt = db.prepare(`
            SELECT dr.*, p1.ParaText as doc1ParaText, p2.ParaText as doc2ParaText
            FROM DiffResult dr
            JOIN Paragraph p1 ON dr.DocID1 = p1.DocID AND dr.ParaIndex1 = p1.ParaIndex
            JOIN Paragraph p2 ON dr.DocID2 = p2.DocID AND dr.ParaIndex2 = p2.ParaIndex
            WHERE dr.DocID1 = ? AND dr.DocID2 = ?
            ORDER BY dr.ParaIndex1
        `);
            let rows = stmt.all(docId1, docId2) as any[];
            if (rows.length > 0) {
                return rows.map(r => ({
                    ...r,
                    DocID1: r.DocID1,
                    DocID2: r.DocID2,
                    paraIndex1: r.ParaIndex1,
                    paraIndex2: r.ParaIndex2,
                    docId1: r.DocID1,
                    docId2: r.DocID2,
                    highlights: JSON.parse(r.Highlights),
                }));
            }

            // 2. 交换顺序查询（缓存中可能以相反顺序存储）
            stmt = db.prepare(`
            SELECT dr.*, p1.ParaText as doc1ParaText, p2.ParaText as doc2ParaText
            FROM DiffResult dr
            JOIN Paragraph p1 ON dr.DocID1 = p1.DocID AND dr.ParaIndex1 = p1.ParaIndex
            JOIN Paragraph p2 ON dr.DocID2 = p2.DocID AND dr.ParaIndex2 = p2.ParaIndex
            WHERE dr.DocID1 = ? AND dr.DocID2 = ?
            ORDER BY dr.ParaIndex1
        `);
            rows = stmt.all(docId2, docId1) as any[];
            if (rows.length > 0) {
                // DB 存储顺序是 (DocID1=source, DocID2=new)，需要反转以确保 doc1 始终是调用方传入的 docId1
                // 同时需要翻转 highlights 中的 added/removed 标记，因为 diff 方向颠倒了
                return rows.map(r => {
                    const highlights = JSON.parse(r.Highlights);
                    const swappedHighlights = highlights.map((seg: any) => {
                        if (seg.added !== undefined || seg.removed !== undefined) {
                            return {
                                ...seg,
                                added: seg.removed || false,
                                removed: seg.added || false,
                            };
                        }
                        return seg;
                    });
                    return {
                        docId1,
                        docId2,
                        DocID1: docId1,
                        DocID2: docId2,
                        paraIndex1: r.ParaIndex2,
                        paraIndex2: r.ParaIndex1,
                        doc1ParaText: r.doc2ParaText,
                        doc2ParaText: r.doc1ParaText,
                        highlights: swappedHighlights,
                    };
                });
            }

            // 3. 实时计算（缓存未命中）
            console.log(`[Compare] 实时计算文档 ${docId1} 与 ${docId2}`);
            const { compareDocs } = require('./dedup/diffComparator');
            let results = compareDocs(docId1, docId2, 0.001);
            if (results.length === 0) {
                console.warn(`[Compare] diff 无结果，降级为哈希匹配`);
                const { getParagraphsByDoc } = require('./database/models');
                const { diffParagraphs } = require('./dedup/diffComparator');
                const paras1 = getParagraphsByDoc(docId1) as { ParaIndex: number; ParaText: string; ParaHash: string }[];
                const paras2 = getParagraphsByDoc(docId2) as { ParaIndex: number; ParaText: string; ParaHash: string }[];
                const hashSet = new Set(paras2.map(p => p.ParaHash));
                const duplicates1 = paras1.filter(p => hashSet.has(p.ParaHash));
                if (duplicates1.length > 0) {
                    results = duplicates1.map(p1 => {
                        const p2 = paras2.find(p => p.ParaHash === p1.ParaHash)!;
                        // 使用 diffParagraphs 生成带 added/removed 标记的正确高亮段，确保两侧各显原文
                        const properHighlights = diffParagraphs(p1.ParaText, p2.ParaText);
                        return {
                            docId1,
                            docId2,
                            DocID1: docId1,
                            DocID2: docId2,
                            paraIndex1: p1.ParaIndex,
                            paraIndex2: p2.ParaIndex,
                            doc1ParaText: p1.ParaText,
                            doc2ParaText: p2.ParaText,
                            highlights: properHighlights,
                        };
                    });
                }
            }
            // 统一规范化输出格式，确保前端能正确读取 DocID1/DocID2 和 paraIndex1/paraIndex2
            return results.map((r: any) => ({
                ...r,
                DocID1: r.DocID1 ?? r.docId1,
                DocID2: r.DocID2 ?? r.docId2,
                paraIndex1: r.paraIndex1 ?? r.ParaIndex1,
                paraIndex2: r.paraIndex2 ?? r.ParaIndex2,
            }));
        } catch (err) {
            console.error('[Compare] 获取重复段落失败:', err);
            return [];
        }
    });

    // 打开文档
    ipcMain.handle('open-doc', async (_, filePath: string) => {
        try {
            const { shell } = require('electron');
            shell.openPath(filePath);
            return { success: true };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(msg);
            return { success: false, error: msg };
        }
    });

    // 单个删除
    ipcMain.handle('delete-doc', async (_, docId: number) => {
        return deleteDoc(docId);
    });

    // 批量删除
    ipcMain.handle('batch-delete', async (_, docIds: number[]) => {
        // let successCount = 0,
        //     failCount = 0;
        // for (const id of docIds) {
        //     if (deleteDoc(id)) successCount++;
        //     else failCount++;
        // }
        // return { successCount, failCount };
        const { batchDeleteDocs } = require('./database/models');
        return batchDeleteDocs(docIds);
    });

    // 批量标记源文档
    ipcMain.handle('batch-mark-source', async (_, docIds: number[]) => {
        try {
            markDocsAsSource(docIds);
            return { success: true };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(msg);
            return { success: false, error: msg };
        }
    });

    // 导出数据（CSV + 文档ZIP 打包成一个ZIP）
    ipcMain.handle('export-data-zip', async (event, docIds: number[]) => {
        const db = getDB();
        const placeholders = docIds.map(() => '?').join(',');
        const stmt = db.prepare(
            `SELECT DocID, FileName, FilePath, ParagraphCount, WordCount, RepeatRate, RepeatStatus, IsSource, CreateTime
       FROM Document WHERE DocID IN (${placeholders}) AND IsSource = 1`
        );
        const docs = stmt.all(...docIds) as any[];

        if (docs.length === 0) {
            throw new Error('没有可导出的源文档');
        }

        // 生成 CSV
        const header = ['序号', '文件名', '段落数', '总字数', '重复率', '状态', '是否源文档', '导入时间'];
        const rows = docs.map((doc, idx) => [
            idx + 1,
            doc.FileName,
            doc.ParagraphCount,
            doc.WordCount,
            (doc.RepeatRate * 100).toFixed(1) + '%',
            ['无重复', '部分重复', '完全重复'][doc.RepeatStatus] || '未知',
            doc.IsSource === 1 ? '是' : '否',
            doc.CreateTime,
        ]);
        const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
        const csvBuffer = Buffer.from('\uFEFF' + csvContent, 'utf8');

        // 打包文档为 ZIP
        const docZip = new AdmZip();
        for (const doc of docs) {
            if (fs.existsSync(doc.FilePath)) {
                docZip.addLocalFile(doc.FilePath, undefined, doc.FileName);
            } else {
                console.warn('文件不存在:', doc.FilePath);
            }
        }
        const docZipBuffer = docZip.toBuffer();

        // 最终打包
        const totalZip = new AdmZip();
        totalZip.addFile('统计信息.csv', csvBuffer);
        totalZip.addFile('文档原文.zip', docZipBuffer);

        const result = await dialog.showSaveDialog(mainWindow!, {
            defaultPath: `导出数据_${new Date().toISOString().slice(0, 10)}.zip`,
            filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
        });
        if (!result.canceled && result.filePath) {
            fs.writeFileSync(result.filePath, totalZip.toBuffer());
            return { success: true, path: result.filePath };
        } else {
            return { success: false, canceled: true };
        }
    });

    // 获取待确认文档（查重列表）
    ipcMain.handle('get-pending-docs', async () => {
        const { getPendingDocs } = require('./database/models');
        return getPendingDocs();
    });

    // 获取段落上下文
    // src/main/main.ts
    ipcMain.handle('get-paragraph-context', async (_, docId: number, paraIndex: number, contextSize: number = 3) => {
        console.log('[上下文] 收到请求:', { docId, paraIndex, contextSize });
        const db = getDB();
        const start = Math.max(1, paraIndex - contextSize);
        const end = paraIndex + contextSize;
        console.log('[上下文] 查询范围:', { start, end });

        const stmt = db.prepare(`
            SELECT ParaIndex, ParaText
            FROM Paragraph
            WHERE DocID = ? AND ParaIndex BETWEEN ? AND ?
            ORDER BY ParaIndex
        `);
        const rows = stmt.all(docId, start, end) as { ParaIndex: number; ParaText: string }[];
        console.log('[上下文] 返回行数:', rows.length);
        return rows;
    });

    // 日志
    ipcMain.handle('get-check-logs', async () => {
        const { getCheckLogs } = require('./database/models');
        return getCheckLogs(200); // 最近200条
    });

    // 批量导入存量文档（不查重）
    ipcMain.handle('import-legacy-files', async (event, filePaths: string[]) => {
        const { parseWordFile } = require('./parser/wordParser');
        const { batchInsertLegacyDocs } = require('./database/models');
        const results = [];
        for (const filePath of filePaths) {
            try {
                const parsed = await parseWordFile(filePath);
                // 不查重，直接插入
                const doc = {
                    FileName: parsed.fileName,
                    FilePath: parsed.filePath,
                    FileSize: parsed.fileSize,
                    ParagraphCount: parsed.paragraphs.length,
                    WordCount: parsed.fullText.length,
                    FullTextHash: '', // 不计算哈希
                    IsSource: 1,
                    RepeatStatus: 0, // 未查重
                    RepeatRate: 0,
                    CreateTime: new Date().toISOString(),
                    ExcludedRefWords: 0,
                };
                batchInsertLegacyDocs([doc]);
                results.push({ filePath, status: 'success' });
            } catch (err: any) {
                results.push({ filePath, status: 'failed', error: err.message });
            }
        }
        return results;
    });

    // 批量导入文件夹中的存量文档（不查重，用于初始化已人工查重过的文档）
    ipcMain.handle('import-legacy-folder', async (event, folderPath: string) => {
        event.sender.send('import-progress', { type: 'start', total: 0, status: '扫描文件夹...' });

        const { parseWordFile } = require('./parser/wordParser');
        const { batchInsertLegacyDocs } = require('./database/models');

        // 递归扫描文件夹中的所有 .docx / .doc 文件
        function scanFiles(dir: string): string[] {
            const files: string[] = [];
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                const fullPath = path.join(dir, entry);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        files.push(...scanFiles(fullPath));
                    } else if (entry.toLowerCase().endsWith('.docx') || entry.toLowerCase().endsWith('.doc')) {
                        files.push(fullPath);
                    }
                } catch (_) { /* 跳过无法访问的文件 */ }
            }
            return files;
        }

        const filePaths = scanFiles(folderPath);
        const total = filePaths.length;
        let success = 0;
        let failed = 0;
        const results: { filePath: string; status: 'success' | 'failed'; error?: string }[] = [];

        event.sender.send('import-progress', { type: 'start', total, status: `找到 ${total} 个 Word 文档` });

        for (let i = 0; i < filePaths.length; i++) {
            const filePath = filePaths[i];
            const fileName = path.basename(filePath);
            event.sender.send('import-progress', {
                type: 'progress',
                file: fileName,
                index: i + 1,
                total,
                status: '解析中...',
            });
            try {
                const parsed = await parseWordFile(filePath);
                const doc = {
                    FileName: parsed.fileName,
                    FilePath: parsed.filePath,
                    FileSize: parsed.fileSize,
                    ParagraphCount: parsed.paragraphs.length,
                    WordCount: parsed.fullText.length,
                    FullTextHash: '',
                    IsSource: 1,
                    RepeatStatus: 0,
                    RepeatRate: 0,
                    CreateTime: new Date().toISOString(),
                    ExcludedRefWords: 0,
                };
                const { batchInsertLegacyDocs, insertParagraphs } = require('./database/models');
                const { buildNGramIndex } = require('./dedup/ngramIndex');
                const { hashText } = require('./dedup/hashComparator');
                const docId = batchInsertLegacyDocs([doc]);
                // 插入段落
                const paras = parsed.paragraphs.map((text: string, idx: number) => ({
                    DocID: docId,
                    ParaIndex: idx + 1,
                    ParaText: text,
                    ParaHash: hashText(text),
                    Length: text.length,
                }));
                insertParagraphs(paras);
                // 构建 N-gram 索引，使该文档能参与后续查重比对
                buildNGramIndex(docId, parsed.paragraphs, appConfig.ngramLength || 16);
                success++;
                results.push({ filePath, status: 'success' });
            } catch (err: any) {
                failed++;
                results.push({ filePath, status: 'failed', error: err.message });
            }
            event.sender.send('import-progress', {
                type: 'progress',
                file: fileName,
                index: i + 1,
                total,
                status: '完成',
                success,
                failed,
            });
        }

        event.sender.send('import-progress', {
            type: 'done',
            success,
            failed,
            skipped: 0,
        });

        // 写入操作日志
        const { insertCheckLog } = require('./database/models');
        insertCheckLog({
            ExecTime: new Date().toISOString(),
            TotalFiles: success + failed,
            SuccessCount: success,
            FailedCount: failed,
            SkippedCount: 0,
            FileList: JSON.stringify(filePaths.slice(0, 10)), // 只记录前10个
            Details: `批量导入存量文档: ${success}个成功, ${failed}个失败`,
        });

        return results;
    });

    // ipcMain.handle('get-doc-paragraphs', async (_, docId: number) => {
    //     const db = getDB();
    //     return db.prepare('SELECT ParaIndex, ParaText FROM Paragraph WHERE DocID = ? ORDER BY ParaIndex').all(docId);
    // });

    // 配置文件路径（与顶部加载逻辑一致）
    function getConfigPath(): string {
        return process.env.NODE_ENV === 'production'
            ? path.join(process.resourcesPath, 'app', 'config', 'config.json')
            : path.join(__dirname, '../config/config.json');
    }

    ipcMain.handle('getConfig', async () => {
        return appConfig;
    });

    ipcMain.handle('saveConfig', async (_, config: any) => {
        try {
            const configPath = getConfigPath();
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
            // 更新内存中的配置
            appConfig = { ...appConfig, ...config };
            console.log('[Config] 配置已保存到:', configPath);
            return { success: true };
        } catch (err: any) {
            console.error('[Config] 保存配置失败:', err);
            return { success: false, error: err.message };
        }
    });

}