import { createHash } from 'crypto';
import { getDB } from '../database/db';

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export interface CheckResult {
  isFullDuplicate: boolean;
  repeatRate: number;
  repeatParaCount: number;
  repeatParaIndices: number[];
  matchedDocIds: number[];
}

export function checkDuplicate(
  docId: number,
  paragraphs: string[],
  fullTextHash: string,
  config: { minMatchChars?: number } = {}
): CheckResult {
  const db = getDB();
  // 1. 全文哈希检查
  const fullMatch = db.prepare('SELECT DocID FROM Document WHERE FullTextHash = ? AND IsSource = 1').get(fullTextHash);
  if (fullMatch) {
    return {
      isFullDuplicate: true,
      repeatRate: 1.0,
      repeatParaCount: paragraphs.length,
      repeatParaIndices: paragraphs.map((_, i) => i),
      matchedDocIds: [fullMatch.DocID]
    };
  }

  // 2. 段落哈希检查
  const hashes = paragraphs.map(p => hashText(p));
  const placeholders = hashes.map(() => '?').join(',');
  // 查询这些哈希是否存在于源文档中
  const stmt = db.prepare(`SELECT ParaHash, DocID FROM ParaHashIndex WHERE ParaHash IN (${placeholders})`);
  const rows = stmt.all(...hashes) as { ParaHash: string; DocID: number }[];
  const hashSet = new Set(rows.map(r => r.ParaHash));
  const repeatParaIndices: number[] = [];
  const matchedDocIds: number[] = [];
  for (let i = 0; i < hashes.length; i++) {
    if (hashSet.has(hashes[i])) {
      repeatParaIndices.push(i);
      // 收集匹配到的DocID
      const docs = rows.filter(r => r.ParaHash === hashes[i]).map(r => r.DocID);
      matchedDocIds.push(...docs);
    }
  }
  const repeatParaCount = repeatParaIndices.length;
  // 计算重复字数（需要获取段落长度，此处简化，假设传入段落文本长度）
  const lengths = paragraphs.map(p => p.length);
  const totalWordCount = lengths.reduce((a, b) => a + b, 0);
  let repeatWordCount = 0;
  for (const idx of repeatParaIndices) {
    repeatWordCount += lengths[idx];
  }
  const repeatRate = totalWordCount > 0 ? repeatWordCount / totalWordCount : 0;
  return {
    isFullDuplicate: false,
    repeatRate,
    repeatParaCount,
    repeatParaIndices,
    matchedDocIds: [...new Set(matchedDocIds)]
  };
}