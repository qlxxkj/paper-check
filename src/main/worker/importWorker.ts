import { parentPort, workerData } from 'worker_threads';
import { parseWordFile } from '../parser/wordParser';
import { filterReferences } from '../parser/refFilter';
import { hashText, checkDuplicate } from '../dedup/hashComparator';
import { insertDocument, insertParagraphs, updateDocRepeatStatus, markAsSource } from '../database/models';
import { Document } from '../../shared/types';

const { filePaths } = workerData;

async function processFiles() {
  let success = 0, failed = 0, skipped = 0;
  for (const filePath of filePaths) {
    try {
      // 解析
      const parsed = await parseWordFile(filePath);
      // 引用排除
      const { cleanText, excludedCount } = filterReferences(parsed.fullText);
      const paragraphs = cleanText.split(/\r?\n\r?\n/).map(p => p.trim()).filter(p => p.length > 0);
      if (paragraphs.length === 0) {
        skipped++;
        parentPort?.postMessage({ type: 'progress', file: filePath, status: 'skipped', reason: '无有效段落' });
        continue;
      }
      const fullTextHash = hashText(cleanText);
      // 暂存文档
      const doc: Omit<Document, 'DocID'> = {
        FileName: parsed.fileName,
        FilePath: parsed.filePath,
        FileSize: parsed.fileSize,
        ParagraphCount: paragraphs.length,
        WordCount: cleanText.length,
        FullTextHash: fullTextHash,
        IsSource: 0,
        RepeatStatus: 0,
        RepeatRate: 0,
        CreateTime: new Date().toISOString(),
        ExcludedRefWords: excludedCount
      };
      const docId = insertDocument(doc);
      // 插入段落
      const paras = paragraphs.map((text, idx) => ({
        DocID: docId,
        ParaIndex: idx + 1,
        ParaText: text,
        ParaHash: hashText(text),
        Length: text.length
      }));
      insertParagraphs(paras);
      // 查重
      const result = checkDuplicate(docId, paragraphs, fullTextHash);
      updateDocRepeatStatus(docId, result.isFullDuplicate ? 2 : (result.repeatRate > 0 ? 1 : 0), result.repeatRate);
      // 入库确认：若重复率为0，则弹窗由主进程处理，但此处只标记
      if (result.repeatRate === 0 && !result.isFullDuplicate) {
        // 无重复，需要用户确认，我们通过主进程弹窗，此处暂不处理
        // 可以在主进程中调用dialog，此处只返回结果
      } else {
        // 有重复，不入库（IsSource保持0）
      }
      success++;
      parentPort?.postMessage({ type: 'progress', file: filePath, status: 'success', docId });
    } catch (err: any) {
      failed++;
      parentPort?.postMessage({ type: 'progress', file: filePath, status: 'failed', error: err.message });
    }
  }
  parentPort?.postMessage({ type: 'done', success, failed, skipped });
}

processFiles();