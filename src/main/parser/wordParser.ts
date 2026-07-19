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

// 解析word文档，目前只支持docx格式，不支持doc和pdf
export async function parseWordFile(filePath: string): Promise<ParsedResult> {
  const ext = path.extname(filePath).toLowerCase();
  let text = '';

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    text = result.value;
  } else if (ext === '.pdf') {
      throw new Error('暂不支持 PDF 格式，请转换为 .docx 后导入');
  } else if (ext === '.doc') {
      throw new Error('暂不支持 .doc 格式，请将文档另存为 .docx 后再导入');
  } else {
    throw new Error('不支持的文件格式，仅支持 .docx');
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