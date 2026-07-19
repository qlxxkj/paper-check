import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { initDB, getDB } from './database/db';
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

let mainWindow: BrowserWindow | null = null;

function createWindow() {
    Menu.setApplicationMenu(null);
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
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

app.whenReady().then(() => {
    initDB();
    createWindow();
    registerIpcHandlers();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
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
            } else if (file.endsWith('.docx') || file.endsWith('.doc')) {
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
    const configPath = path.join(__dirname, '../config/config.json');
    const configContent = fs.readFileSync(configPath, 'utf-8');
    appConfig = JSON.parse(configContent);
    // console.log('[Config] 加载配置成功:', appConfig);
} catch (err) {
    console.error('[Config] 加载配置失败，使用默认值:', err);
    // 默认值
    appConfig = {
        fullDuplicateThreshold: 0.995,
        partialDuplicateThreshold: 0.01,
        diffThreshold: 0.01,
        ngramLength: 13,
        minMatchChars: 13,
        sensitivity: 0.05,
        enableRefFilter: true,
        minSharedNgrams: 5   // 默认值
    };
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
            filters: [{ name: 'Word 文档', extensions: ['docx', 'doc'] }],
        });
        return result;
    });

    ipcMain.handle('import-files', async (event, filePaths: string[]) => {
        return importFilesHandler(filePaths, (progress) => {
            event.sender.send('import-progress', progress);
        }, appConfig);
    });

    ipcMain.handle('import-folder', async (event, folderPath: string) => {
        const files = getAllWordFiles(folderPath);
        if (files.length === 0) {
            return { success: 0, failed: 0, skipped: 0, message: '该文件夹下没有 Word 文档' };
        }
        return importFilesHandler(files, (progress) => {
            event.sender.send('import-progress', progress);
        }, appConfig);
    });

    ipcMain.handle('import-mixed', async (event, paths: string[]) => {
        const allFiles: string[] = [];
        for (const p of paths) {
            try {
                const stat = fs.statSync(p);
                if (stat.isDirectory()) {
                    const files = getAllWordFiles(p);
                    allFiles.push(...files);
                } else if (stat.isFile() && (p.endsWith('.docx') || p.endsWith('.doc'))) {
                    allFiles.push(p);
                }
            } catch (err) {
                console.error('处理路径失败:', p, err);
            }
        }
        if (allFiles.length === 0) {
            return { success: 0, failed: 0, skipped: 0, message: '没有找到 Word 文档' };
        }
        return importFilesHandler(allFiles, (progress) => {
            event.sender.send('import-progress', progress);
        }, appConfig);
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
        const minSharedNgrams = appConfig.minSharedNgrams || 5; // 读取配置
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
          AND d.IsSource = 1
        GROUP BY d.DocID
        HAVING COUNT(DISTINCT idx.ngram) >= ${minSharedNgrams}   -- 至少共享5个N-gram，降低门槛确保召回
        ORDER BY d.CreateTime ASC
    `);
        console.log('[get-repeat-relations] minSharedNgrams =', minSharedNgrams);//新增日志
        const rows = stmt.all(...ngrams, docId) as { DocID: number; FileName: string; RepeatRate: number; RepeatStatus: number }[];
        return rows;
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
                    highlights: JSON.parse(r.Highlights),
                    paraIndex1: r.ParaIndex1,
                    paraIndex2: r.ParaIndex2,
                }));
            }

            // 2. 交换顺序查询
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
                return rows.map(r => ({
                    docId1: r.DocID1,
                    docId2: r.DocID2,
                    paraIndex1: r.ParaIndex1,
                    paraIndex2: r.ParaIndex2,
                    doc1ParaText: r.doc2ParaText,
                    doc2ParaText: r.doc1ParaText,
                    highlights: JSON.parse(r.Highlights),
                }));
            }

            // 3. 实时计算
            console.log(`[Compare] 实时计算文档 ${docId1} 与 ${docId2}`);
            const { compareDocs } = require('./dedup/diffComparator');
            let results = compareDocs(docId1, docId2, 0.001);
            if (results.length === 0) {
                console.warn(`[Compare] diff 无结果，降级为哈希匹配`);
                const { getParagraphsByDoc } = require('./database/models');
                const paras1 = getParagraphsByDoc(docId1) as { ParaIndex: number; ParaText: string; ParaHash: string }[];
                const paras2 = getParagraphsByDoc(docId2) as { ParaIndex: number; ParaText: string; ParaHash: string }[];
                const hashSet = new Set(paras2.map(p => p.ParaHash));
                const duplicates1 = paras1.filter(p => hashSet.has(p.ParaHash));
                if (duplicates1.length > 0) {
                    results = duplicates1.map(p1 => {
                        const p2 = paras2.find(p => p.ParaHash === p1.ParaHash)!;
                        return {
                            docId1,
                            docId2,
                            paraIndex1: p1.ParaIndex,
                            paraIndex2: p2.ParaIndex,
                            doc1ParaText: p1.ParaText,
                            doc2ParaText: p2.ParaText,
                            highlights: [{ text: p1.ParaText, isHighlight: true }],
                        };
                    });
                }
            }
            return results;
        } catch (err) {
            console.error('[Compare] 获取重复段落失败:', err);
            return [];
        }
    });


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


    ipcMain.handle('delete-doc', async (_, docId: number) => {
        return deleteDoc(docId);
    });

    ipcMain.handle('batch-delete', async (_, docIds: number[]) => {
        let successCount = 0,
            failCount = 0;
        for (const id of docIds) {
            if (deleteDoc(id)) successCount++;
            else failCount++;
        }
        return { successCount, failCount };
    });


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

    // 获取 Diff 结果（已被 get-duplicate-paragraphs 覆盖，但保留兼容）
    ipcMain.handle('get-doc-diff', async (_, docId1: number, docId2: number) => {
        // 重定向到 get-duplicate-paragraphs
        return ipcMain.emit('get-duplicate-paragraphs', _, docId1, docId2);
    });

}