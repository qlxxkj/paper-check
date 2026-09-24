package dedup

// HasLongCommonSubstring 对齐 similarity.ts：暴力滑动窗口判断是否有 >= minMatch 的公共子串
func HasLongCommonSubstring(text1, text2 string, minMatch int) bool {
	if minMatch <= 0 {
		minMatch = 13
	}
	if len(text1) < minMatch || len(text2) < minMatch {
		return false
	}
	for i := 0; i <= len(text1)-minMatch; i++ {
		sub := text1[i : i+minMatch]
		contains := indexContains(text2, sub)
		if contains {
			return true
		}
	}
	return false
}

func indexContains(haystack, needle string) bool {
	if len(needle) == 0 {
		return true
	}
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
