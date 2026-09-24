package dedup

import (
	"testing"
)

// 验证字符级 diff：共有部分 isHighlight=true
func TestDiffParagraphs(t *testing.T) {
	segs := DiffParagraphs("hello world", "hello earth")
	// 共有 "hello " → highlight；"world"/"earth" 部分 → 不 highlight
	var common string
	for _, s := range segs {
		if s.IsHighlight {
			common += s.Text
		}
	}
	// "hello " 是公共前缀
	if !contains(common, "hello") {
		t.Fatalf("应包含公共部分 'hello'，得到 %q", common)
	}
}

// 完全相同 → 全部 highlight
func TestDiffIdentical(t *testing.T) {
	segs := DiffParagraphs("same", "same")
	all := true
	for _, s := range segs {
		if !s.IsHighlight {
			all = false
			break
		}
	}
	if !all {
		t.Fatalf("相同文本应全部高亮，得到 %v", segs)
	}
}

// HashText 确定性
func TestHashText(t *testing.T) {
	h1 := HashText("abc")
	h2 := HashText("abc")
	if h1 != h2 {
		t.Fatalf("hash 应确定，%s != %s", h1, h2)
	}
	if len(h1) != 64 {
		t.Fatalf("sha256 hex 应 64 位，得到 %d", len(h1))
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
