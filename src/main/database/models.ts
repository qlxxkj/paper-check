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
  db.exec('DELETE FROM Document');
  return true;
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