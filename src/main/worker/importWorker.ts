import { parentPort, workerData } from 'worker_threads';
import { parseWordFile } from '../parser/wordParser';
import { filterReferences } from '../parser/refFilter';
import { hashText } from '../dedup/hashComparator';
import {
    insertDocument,
    insertParagraphs,
    updateDocRepeatStatus,
    markAsSource,
    storeDiffResults,
} from '../database/models';
import { Document } from '../../shared/types';
import { buildNGramIndex, findCandidates } from '../dedup/ngramIndex';
import { compareDocs, DiffResult } from '../dedup/diffComparator';


const { filePaths, config } = workerData;

async function processFiles() {
    console.log('[ImportWorker] 收到配置:', config);// 新增日志
    let success = 0,
        failed = 0,
        skipped = 0;

    for (const filePath of filePaths) {
        try {
            // 1. 解析文档
            const parsed = await parseWordFile(filePath);

            // 2. 引用排除
            const { cleanText, excludedCount } = filterReferences(parsed.fullText);
            const paragraphs = cleanText
                .split(/\r?\n\r?\n/)
                .map((p) => p.trim())
                .filter((p) => p.length > 0);

            if (paragraphs.length === 0) {
                skipped++;
                parentPort?.postMessage({
                    type: 'progress',
                    file: filePath,
                    status: 'skipped',
                    reason: '无有效段落',
                });
                continue;
            }

            const fullTextHash = hashText(cleanText);

            // 插入文档
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
                ExcludedRefWords: excludedCount,
            };
            const docId = insertDocument(doc);

            // 插入段落
            const paras = paragraphs.map((text, idx) => ({
                DocID: docId,
                ParaIndex: idx + 1,
                ParaText: text,
                ParaHash: hashText(text),
                Length: text.length,
            }));
            insertParagraphs(paras);

            // ====== 新查重流程 ======
            // 构建 N-gram 索引
            buildNGramIndex(docId, paragraphs, 13);

            // 粗筛候选源文档
            const candidateIds = findCandidates(paragraphs, 13);
            let highestRate = 0;
            let bestMatchDocId = -1;
            let bestDiffResults: DiffResult[] = [];

            for (const candId of candidateIds) {
                const diffResults = compareDocs(docId, candId, 0.01);
                // 计算总重复率（只计算当前文档的重复字符数）
                const totalRepeatChars = diffResults.reduce((sum, r) => {
                    const chars = r.highlights
                        .filter(h => h.isHighlight)
                        .reduce((s, h) => s + h.text.length, 0);
                    return sum + (r.matchRate * r.doc1ParaText.length);
                }, 0);
                const totalChars = paragraphs.reduce((sum, p) => sum + p.length, 0);
                const rate = totalChars > 0 ? totalRepeatChars / totalChars : 0;
                if (rate > highestRate) {
                    highestRate = rate;
                    bestMatchDocId = candId;
                    bestDiffResults = diffResults;
                }
            }

            // 更新文档状态
            let status = 0;
            if (highestRate >= 0.995) status = 2;
            else if (highestRate > 0.05) status = 1;
            updateDocRepeatStatus(docId, status, highestRate);

            if (highestRate === 0) {
                markAsSource(docId);
                parentPort?.postMessage({
                    type: 'progress',
                    file: filePath,
                    status: 'success',
                    docId,
                    repeatRate: 0,
                    isSource: true,
                });
            } else {
                if (bestMatchDocId !== -1 && bestDiffResults.length > 0) {
                    try {
                        storeDiffResults(docId, bestMatchDocId, bestDiffResults);
                        console.log(`[Import] 存储 DiffResult 成功，文档 ${docId}，匹配 ${bestMatchDocId}`);
                    } catch (err) {
                        console.error(`[Import] 存储 DiffResult 失败:`, err);
                    }
                }
                parentPort?.postMessage({
                    type: 'progress',
                    file: filePath,
                    status: 'success',
                    docId,
                    repeatRate: highestRate,
                    isSource: false,
                    repeatParaCount: bestDiffResults.length,
                });
            }

            success++;
        } catch (err: any) {
            failed++;
            parentPort?.postMessage({
                type: 'progress',
                file: filePath,
                status: 'failed',
                error: err.message || '未知错误',
            });
        }
    }

    parentPort?.postMessage({
        type: 'done',
        success,
        failed,
        skipped,
    });
}

processFiles();