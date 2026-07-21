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

/**
 * 获取 antiword 可执行文件的路径（不依赖 electron 模块）
 */
function getAntiwordPath(): string {
    const possiblePaths = [
        // 开发环境：项目根目录
        path.join(__dirname, '../../resources/antiword/antiword.exe'),
        // 打包后：resources/app/resources/antiword/antiword.exe
        path.join(process.resourcesPath || '', 'resources/antiword/antiword.exe'),
        // 备选：与 exe 同级（但 Worker 中无法获取 exe 路径，所以跳过）
        // 如果以上都不存在，尝试系统 PATH
        'antiword.exe',
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return 'antiword.exe'; // 最后尝试系统 PATH
}

// 解析 .doc 文件（使用 child_process 调用 antiword）
import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);

async function parseDocWithAntiword(filePath: string): Promise<string> {
    const antiwordPath = getAntiwordPath();
    try {
        const { stdout, stderr } = await execPromise(`"${antiwordPath}" -t "${filePath}"`);
        if (stderr) console.warn('antiword stderr:', stderr);
        return stdout;
    } catch (error: any) {
        throw new Error(`antiword 解析失败: ${error.message}`);
    }
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
    //   throw new Error('暂不支持 .doc 格式，请将文档另存为 .docx 后再导入');
      text = await parseDocWithAntiword(filePath);
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