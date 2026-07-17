import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';

export interface ParsedResult {
  fileName: string;
  filePath: string;
  fileSize: number;
  fullText: string;
  paragraphs: string[];
  createTime: string;
  modifyTime: string;
}

export async function parseWordFile(filePath: string): Promise<ParsedResult> {
  const ext = path.extname(filePath).toLowerCase();
  let text = '';
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    text = result.value;
  } else if (ext === '.doc') {
    // 使用textract (需安装)
    const textract = require('textract');
    text = await new Promise((resolve, reject) => {
      textract.fromFileWithPath(filePath, (err: any, txt: string) => {
        if (err) reject(err);
        else resolve(txt);
      });
    });
  } else {
    throw new Error('不支持的文件格式，仅支持 .doc 和 .docx');
  }

  // 按段落拆分（两个换行或更多）
  const paragraphs = text.split(/\r?\n\r?\n/).map(p => p.trim()).filter(p => p.length > 0);
  const stats = fs.statSync(filePath);
  return {
    fileName: path.basename(filePath),
    filePath,
    fileSize: stats.size,
    fullText: text,
    paragraphs,
    createTime: stats.birthtime.toISOString(),
    modifyTime: stats.mtime.toISOString()
  };
}