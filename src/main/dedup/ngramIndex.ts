// src/main/dedup/ngramIndex.ts
import { getDB } from '../database/db';

/**
 * 为文档的每个段落生成 N-gram 指纹，并存入倒排索引表
 * 表结构：NGramIndex (ngram TEXT, DocID INTEGER, ParaIndex INTEGER)
 */
export function buildNGramIndex(docId: number, paragraphs: string[], n: number = 13) {
  const db = getDB();
  const insert = db.prepare('INSERT INTO NGramIndex (ngram, DocID, ParaIndex) VALUES (?, ?, ?)');
  const transaction = db.transaction((entries: [string, number, number][]) => {
    for (const [ngram, docId, paraIdx] of entries) {
      insert.run(ngram, docId, paraIdx);
    }
  });

  const entries: [string, number, number][] = [];
  for (let idx = 0; idx < paragraphs.length; idx++) {
    const text = paragraphs[idx];
    // 滑动窗口提取连续 N 个字符（只保留字母数字和中文，去除空白）
    const clean = text.replace(/\s+/g, '');
    for (let i = 0; i <= clean.length - n; i++) {
      const ngram = clean.substring(i, i + n);
      entries.push([ngram, docId, idx + 1]); // paraIndex 从1开始
    }
  }
  transaction(entries);
}

/**
 * 粗筛：给定新文档的段落，返回可能相似的候选文档ID列表（去重）
 */
export function findCandidates(paragraphs: string[], n: number = 13): number[] {
  const db = getDB();
  const allNgrams: string[] = [];
  for (const para of paragraphs) {
    const clean = para.replace(/\s+/g, '');
    for (let i = 0; i <= clean.length - n; i++) {
      allNgrams.push(clean.substring(i, i + n));
    }
  }
  if (allNgrams.length === 0) return [];

  // 去重 N-gram，减少查询
  const uniqueNgrams = [...new Set(allNgrams)];
  const placeholders = uniqueNgrams.map(() => '?').join(',');
  const stmt = db.prepare(
    `SELECT DISTINCT DocID FROM NGramIndex WHERE ngram IN (${placeholders}) AND DocID NOT IN (SELECT DocID FROM Document WHERE IsSource = 0)`
  );
  const rows = stmt.all(...uniqueNgrams) as { DocID: number }[];
  return rows.map(r => r.DocID);
}