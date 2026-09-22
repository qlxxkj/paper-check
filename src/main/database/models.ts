import { getDB } from './db';
import { Document, Paragraph, RepeatRecord } from '../../shared/types';
import { DiffResult, HighlightSegment } from '../dedup/diffComparator';

export function insertDocument(doc: Omit<Document, 'DocID'>): number {
  const db = getDB();
  const stmt = db.prepare(`
    INSERT INTO Document
      (FileName, FilePath, FileSize, ParagraphCount, WordCount, FullTextHash, IsSource, RepeatStatus, RepeatRate, CreateTime, ExcludedRefWords)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    doc.FileName, doc.FilePath, doc.FileSize, doc.ParagraphCount, doc.WordCount,
    doc.FullTextHash, doc.IsSource, doc.RepeatStatus, doc.RepeatRate, doc.CreateTime, doc.ExcludedRefWords
  );
  return info.lastInsertRowid as number;
}

export function insertParagraphs(paragraphs: Omit<Paragraph, 'ParaID'>[]) {
  const db = getDB();
  const insert = db.prepare(`
    INSERT INTO Paragraph (DocID, ParaIndex, ParaText, ParaHash, Length)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertIndex = db.prepare(`
    INSERT INTO ParaHashIndex (ParaHash, DocID, ParaIndex)
    VALUES (?, ?, ?)
  `);
  const transaction = db.transaction((paras: any[]) => {
    for (const p of paras) {
      insert.run(p.DocID, p.ParaIndex, p.ParaText, p.ParaHash, p.Length);
      insertIndex.run(p.ParaHash, p.DocID, p.ParaIndex);
    }
  });
  transaction(paragraphs);
}

export function getSourceDocs(): Document[] {
  const db = getDB();
  return db.prepare('SELECT * FROM Document WHERE IsSource = 1 ORDER BY CreateTime DESC').all() as Document[];
}

export function getAllDocs(): Document[] {
  const db = getDB();
  return db.prepare('SELECT * FROM Document ORDER BY CreateTime DESC').all() as Document[];
}

export function updateDocRepeatStatus(docId: number, status: number, rate: number) {
  const db = getDB();
  db.prepare('UPDATE Document SET RepeatStatus = ?, RepeatRate = ? WHERE DocID = ?').run(status, rate, docId);
}

export function markAsSource(docId: number) {
  const db = getDB();
  db.prepare('UPDATE Document SET IsSource = 1 WHERE DocID = ?').run(docId);
}

export function deleteAllData() {
  const db = getDB();
  db.exec('DELETE FROM RepeatRecord');
  db.exec('DELETE FROM ParaHashIndex');
  db.exec('DELETE FROM Paragraph');
  db.exec('DELETE FROM NGramIndex');
  db.exec('DELETE FROM DiffResult');
  db.exec('DELETE FROM CheckLog');
  db.exec('DELETE FROM Document');
  return true;
}

/**
 * 重建所有文档的 N-gram 索引（用于 ngramLength 变更后的数据修复）
 * @param ngramLength ngram 长度（从配置读取）
 */
export function rebuildNGramIndex(ngramLength: number): { rebuilt: number; skipped: number } {
    const db = getDB();
    // 清空旧索引
    db.exec('DELETE FROM NGramIndex');

    const allDocs = db.prepare('SELECT DocID, FileName FROM Document').all() as { DocID: number; FileName: string }[];
    let rebuilt = 0;
    let skipped = 0;

    const insert = db.prepare('INSERT INTO NGramIndex (ngram, DocID, ParaIndex) VALUES (?, ?, ?)');
    const transaction = db.transaction((entries: [string, number, number][]) => {
        for (const [ngram, docId, paraIdx] of entries) {
            insert.run(ngram, docId, paraIdx);
        }
    });

    for (const doc of allDocs) {
        try {
            const paras = db.prepare('SELECT ParaIndex, ParaText FROM Paragraph WHERE DocID = ? ORDER BY ParaIndex').all(doc.DocID) as { ParaIndex: number; ParaText: string }[];
            if (paras.length === 0) {
                skipped++;
                continue;
            }
            const entries: [string, number, number][] = [];
            for (const para of paras) {
                const clean = para.ParaText.replace(/\s+/g, '');
                for (let i = 0; i <= clean.length - ngramLength; i++) {
                    entries.push([clean.substring(i, i + ngramLength), doc.DocID, para.ParaIndex]);
                }
            }
            if (entries.length > 0) {
                transaction(entries);
                rebuilt++;
            } else {
                skipped++;
            }
        } catch (err) {
            console.error(`[rebuildNGramIndex] 文档 ${doc.DocID}(${doc.FileName}) 重建失败:`, err);
            skipped++;
        }
    }

    return { rebuilt, skipped };
}

export function getParagraphsByDoc(docId: number): Paragraph[] {
  const db = getDB();
  return db.prepare('SELECT * FROM Paragraph WHERE DocID = ? ORDER BY ParaIndex').all(docId) as Paragraph[];
}

// 删除单个文档及其所有关联数据
export function deleteDoc(docId: number): boolean {
    const db = getDB();
    const transaction = db.transaction(() => {
        db.prepare('DELETE FROM RepeatRecord WHERE SourceDocID = ? OR TargetDocID = ?').run(docId, docId);
        db.prepare('DELETE FROM ParaHashIndex WHERE DocID = ?').run(docId);
        db.prepare('DELETE FROM Paragraph WHERE DocID = ?').run(docId);
        db.prepare('DELETE FROM NGramIndex WHERE DocID = ?').run(docId);
        db.prepare('DELETE FROM Document WHERE DocID = ?').run(docId);
    });
    try {
        transaction();
        return true;
    } catch {
        return false;
    }
}

// 批量标记为源文档
export function markDocsAsSource(docIds: number[]): void {
    const db = getDB();
    const stmt = db.prepare('UPDATE Document SET IsSource = 1 WHERE DocID = ?');
    const transaction = db.transaction((ids: number[]) => {
        for (const id of ids) {
            stmt.run(id);
        }
    });
    transaction(docIds);
}

/**
 * 存储 Diff 结果到数据库
 */
export function storeDiffResults(docId1: number, docId2: number, diffResults: DiffResult[]) {
    const db = getDB();
    const insert = db.prepare(
        'INSERT INTO DiffResult (DocID1, DocID2, ParaIndex1, ParaIndex2, Highlights) VALUES (?, ?, ?, ?, ?)'
    );
    const transaction = db.transaction((results: DiffResult[]) => {
        for (const r of results) {
            insert.run(
                r.docId1,
                r.docId2,
                r.paraIndex1,
                r.paraIndex2,
                JSON.stringify(r.highlights)
            );
        }
    });
    transaction(diffResults);
}

/**
 * 批量删除文档（单事务，提升性能）
 */
export function batchDeleteDocs(docIds: number[]): { successCount: number; failCount: number } {
    const db = getDB();
    let successCount = 0;
    let failCount = 0;

    const transaction = db.transaction(() => {
        for (const id of docIds) {
            try {
                // 删除关联数据
                db.prepare('DELETE FROM RepeatRecord WHERE SourceDocID = ? OR TargetDocID = ?').run(id, id);
                db.prepare('DELETE FROM ParaHashIndex WHERE DocID = ?').run(id);
                db.prepare('DELETE FROM Paragraph WHERE DocID = ?').run(id);
                db.prepare('DELETE FROM DiffResult WHERE DocID1 = ? OR DocID2 = ?').run(id, id);
                db.prepare('DELETE FROM NGramIndex WHERE DocID = ?').run(id);
                db.prepare('DELETE FROM Document WHERE DocID = ?').run(id);
                successCount++;
            } catch (e) {
                failCount++;
            }
        }
    });

    transaction();
    return { successCount, failCount };
}

// 获取待确认文档（查重列表）
export function getPendingDocs(): Document[] {
    const db = getDB();
    // 假设 IsSource=0 且 RepeatStatus>0 表示待确认
    return db.prepare('SELECT * FROM Document WHERE IsSource = 0 AND RepeatStatus > 0 ORDER BY CreateTime DESC').all() as Document[];
}

// 获取段落上下文
export function getParagraphContext(docId: number, paraIndex: number, contextSize: number = 3): { prev: Paragraph[], next: Paragraph[] } {
    const db = getDB();
    const stmt = db.prepare('SELECT * FROM Paragraph WHERE DocID = ? AND ParaIndex BETWEEN ? AND ? ORDER BY ParaIndex');
    const prev = stmt.all(docId, paraIndex - contextSize, paraIndex - 1) as Paragraph[];
    const next = stmt.all(docId, paraIndex + 1, paraIndex + contextSize) as Paragraph[];
    return { prev, next };
}

// 批量导入存量文档（不查重），返回插入的第一个 DocID
export function batchInsertLegacyDocs(docs: Omit<Document, 'DocID'>[]): number {
    const db = getDB();
    const insert = db.prepare(`
    INSERT INTO Document (FileName, FilePath, FileSize, ParagraphCount, WordCount, FullTextHash, IsSource, RepeatStatus, RepeatRate, CreateTime, ExcludedRefWords)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    let firstDocId = 0;
    const transaction = db.transaction((items: any[]) => {
        for (const item of items) {
            const info = insert.run(
                item.FileName, item.FilePath, item.FileSize, item.ParagraphCount, item.WordCount,
                item.FullTextHash, 1, 0, 0, item.CreateTime, 0
            );
            if (firstDocId === 0) firstDocId = info.lastInsertRowid as number;
        }
    });
    transaction(docs);
    return firstDocId;
}

export function getCheckLogs(limit: number = 100): any[] {
    const db = getDB();
    return db.prepare('SELECT * FROM CheckLog ORDER BY ExecTime DESC LIMIT ?').all(limit);
}

// 写入操作日志
export function insertCheckLog(log: {
    ExecTime: string;
    TotalFiles: number;
    SuccessCount: number;
    FailedCount: number;
    SkippedCount: number;
    FileList: string;
    Details: string;
}): number {
    const db = getDB();
    const stmt = db.prepare(`
        INSERT INTO CheckLog (ExecTime, TotalFiles, SuccessCount, FailedCount, SkippedCount, FileList, Details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
        log.ExecTime, log.TotalFiles, log.SuccessCount, log.FailedCount,
        log.SkippedCount, log.FileList, log.Details
    );
    return info.lastInsertRowid as number;
}