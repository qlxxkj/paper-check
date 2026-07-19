import * as Diff from 'diff';
import { getDB } from '../database/db';

export interface HighlightSegment {
    text: string;
    isHighlight: boolean;
}

export interface DiffResult {
    docId1: number;
    docId2: number;
    paraIndex1: number;
    paraIndex2: number;
    doc1ParaText: string;
    doc2ParaText: string;
    highlights: HighlightSegment[];
    matchRate: number;
}

export function diffParagraphs(text1: string, text2: string): HighlightSegment[] {
    const charDiff = Diff.diffChars(text1, text2);
    const segments: HighlightSegment[] = [];
    for (const part of charDiff) {
        const isHighlight = !part.added && !part.removed;
        segments.push({ text: part.value, isHighlight });
    }
    return segments;
}

export function compareDocs(
    docId1: number,
    docId2: number,
    threshold: number = 0.001
): DiffResult[] {
    const db = getDB();
    const stmt1 = db.prepare('SELECT ParaIndex, ParaText FROM Paragraph WHERE DocID = ? ORDER BY ParaIndex');
    const stmt2 = db.prepare('SELECT ParaIndex, ParaText FROM Paragraph WHERE DocID = ? ORDER BY ParaIndex');
    const paras1 = stmt1.all(docId1) as { ParaIndex: number; ParaText: string }[];
    const paras2 = stmt2.all(docId2) as { ParaIndex: number; ParaText: string }[];

    const results: DiffResult[] = [];
    for (const p1 of paras1) {
        let bestRate = 0;
        let bestHighlights: HighlightSegment[] = [];
        let bestPara2Index = -1;
        for (const p2 of paras2) {
            const highlights = diffParagraphs(p1.ParaText, p2.ParaText);
            const repeatChars = highlights
                .filter(h => h.isHighlight)
                .reduce((sum: number, h) => sum + h.text.length, 0);
            const rate = p1.ParaText.length > 0 ? repeatChars / p1.ParaText.length : 0;
            if (rate > bestRate) {
                bestRate = rate;
                bestHighlights = highlights; // 保存 diff 生成的精确高亮
                bestPara2Index = p2.ParaIndex;
            }
        }
        if (bestRate >= threshold && bestPara2Index !== -1) {
            // let finalHighlights = bestHighlights;
            // // 如果最佳重复率超过 30%，直接整段高亮
            // if (bestRate > 0.3) {
            //     const p1Text = p1.ParaText;
            //     finalHighlights = [{ text: p1Text, isHighlight: true }];
            // }
            results.push({
                docId1,
                docId2,
                paraIndex1: p1.ParaIndex,
                paraIndex2: bestPara2Index,
                doc1ParaText: p1.ParaText,
                doc2ParaText: paras2.find(p => p.ParaIndex === bestPara2Index)?.ParaText || '',
                matchRate: bestRate,   // 保存最佳匹配率
                // highlights: [{ text: p1.ParaText, isHighlight: true }], // 直接整段高亮
                highlights: bestHighlights, // 使用 diff 高亮，不是整段
            });
        }
    }
    return results;
}