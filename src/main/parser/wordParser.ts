import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import WordExtractor from 'word-extractor';
import PDFParser from 'pdf2json';

export interface ParsedResult {
    fileName: string;
    filePath: string;
    fileSize: number;
    fullText: string;
    paragraphs: string[];
    createTime: string;
    modifyTime: string;
}

// ========== .doc 解析（原样保留） ==========
async function parseDocWithExtractor(filePath: string): Promise<string> {
    try {
        const extractor = new WordExtractor();
        const doc = await extractor.extract(filePath);
        return doc.getBody();
    } catch (error: any) {
        throw new Error(`.doc 解析失败: ${error.message}`);
    }
}

// ========== .pdf 解析（原样保留） ==========
function parsePDF(filePath: string): Promise<string> {
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    if (fileSizeMB > 50) {
        return Promise.reject(new Error(`PDF 文件过大 (${fileSizeMB.toFixed(1)}MB)，请压缩后重试`));
    }
    console.log('[PDF] 开始解析:', filePath);
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                reject(new Error(`PDF解析超时（${filePath}）`));
            }
        }, 30000);

        pdfParser.on('pdfParser_dataError', (err: any) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                console.error('[PDF] 解析错误:', err);
                reject(err);
            }
        });

        pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                console.log('[PDF] 解析完成，页面数:', pdfData?.Pages?.length || 0);
                try {
                    let fullText = '';
                    if (pdfData && pdfData.Pages) {
                        for (const page of pdfData.Pages) {
                            if (page.Texts) {
                                for (const text of page.Texts) {
                                    if (text.R && text.R.length > 0) {
                                        const decoded = decodeURIComponent(text.R[0].T);
                                        fullText += decoded + ' ';
                                    }
                                }
                            }
                        }
                    }
                    console.log('[PDF] 提取文本长度:', fullText.length);
                    if (fullText.trim().length === 0) {
                        console.warn('[PDF] 未能提取到任何文本，可能该 PDF 是扫描件或图片型');
                    }
                    resolve(fullText.trim());
                } catch (err) {
                    reject(err);
                }
            }
        });

        pdfParser.loadPDF(filePath);
    });
}

// ========== 智能 PDF 分段函数 ==========
function splitPDFText(text: string): string[] {
    // 1. 尝试按两个及以上换行拆分
    let parts = text.split(/\r?\n\r?\n/);

    // 2. 如果分段数少于 3（即换行很少），改用句子边界拆分
    if (parts.length < 3) {
        // 匹配中文句号、问号、感叹号，以及英文句号、问号、感叹号
        parts = text.split(/(?<=[。！？.!?])\s*/);
        parts = parts.filter(p => p.trim().length > 0);

        // 3. 如果仍少于 3 段，按句号+空格拆分（更激进）
        if (parts.length < 3) {
            parts = text.split(/(?<=[。！？.!?])\s+/);
            parts = parts.filter(p => p.trim().length > 0);
        }
    }

    // 4. 合并过短的片段（字数小于 5 且不是句子结尾）
    const merged: string[] = [];
    let buffer = '';
    for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed.length < 5 && !trimmed.match(/[。！？.!?]$/)) {
            buffer += ' ' + trimmed;
        } else {
            if (buffer) {
                merged.push(buffer + ' ' + trimmed);
                buffer = '';
            } else {
                merged.push(trimmed);
            }
        }
    }
    if (buffer) merged.push(buffer);

    return merged.map(p => p.trim()).filter(p => p.length > 0);
}

// ========== 主解析函数 ==========
export async function parseWordFile(filePath: string): Promise<ParsedResult> {
    const ext = path.extname(filePath).toLowerCase();
    let text = '';
    let paragraphs: string[] = [];

    console.log('[Parse] 开始解析文件:', filePath, '扩展名:', ext);

    if (ext === '.docx') {
        const result = await mammoth.extractRawText({ path: filePath });
        text = result.value;
        // 按两个换行及以上拆分段落（原方式）
        paragraphs = text.split(/\r?\n\r?\n/).map(p => p.trim()).filter(p => p.length > 0);
    } else if (ext === '.pdf') {
        // text = await parsePDF(filePath);
        // // 使用智能分段函数
        // paragraphs = splitPDFText(text);
        throw new Error(`不支持pdf的文件格式`);
    } else if (ext === '.doc') {
        text = await parseDocWithExtractor(filePath);
        paragraphs = text.split(/\r?\n\r?\n/).map(p => p.trim()).filter(p => p.length > 0);
    } else {
        throw new Error(`不支持的文件格式: ${ext}`);
    }

    console.log('[Parse] 解析完成，段落数:', paragraphs.length);

    const stats = fs.statSync(filePath);
    return {
        fileName: path.basename(filePath),
        filePath,
        fileSize: stats.size,
        fullText: text,
        paragraphs,
        createTime: stats.birthtime.toISOString(),
        modifyTime: stats.mtime.toISOString(),
    };
}