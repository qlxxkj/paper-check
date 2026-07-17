// 简单实现：去除文末参考文献列表（按常见格式）
export function filterReferences(text: string): { cleanText: string; excludedCount: number } {
  // 匹配常见的参考文献开头
  const refPatterns = [
    /参考文献\s*[\r\n]+/i,
    /REFERENCES\s*[\r\n]+/i,
    /\[1\]/  // 若出现[1]则认为是参考文献开始
  ];
  let splitIndex = -1;
  for (const pattern of refPatterns) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      splitIndex = match.index;
      break;
    }
  }
  if (splitIndex === -1) {
    return { cleanText: text, excludedCount: 0 };
  }
  const cleanText = text.substring(0, splitIndex);
  const excluded = text.substring(splitIndex);
  const excludedCount = excluded.length; // 粗略字数
  return { cleanText, excludedCount };
}