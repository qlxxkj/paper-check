// 简略实现，实际可优化
export function hasLongCommonSubstring(text1: string, text2: string, minMatch: number = 13): boolean {
  // 暴力滑动窗口，仅示例
  if (text1.length < minMatch || text2.length < minMatch) return false;
  for (let i = 0; i <= text1.length - minMatch; i++) {
    const sub = text1.substring(i, i + minMatch);
    if (text2.includes(sub)) return true;
  }
  return false;
}