package parser

import (
	"encoding/binary"
	"os"
	"paper-check/internal/ole2"
	"path/filepath"
	"testing"
)

// 构造一个最小 Word97 .doc（OLE2 容器 + WordDocument 流含 FIB + UTF-16LE 正文），
// 验证 parseDoc 能抽出正文各段。
func TestParseDoc(t *testing.T) {
	// 正文：3 段，\n(0x0A 0x00) 分隔，UTF-16LE
	lines := []string{"第一段正文内容", "第二段：测试", "第三段末尾"}
	var body []byte
	for i, ln := range lines {
		for _, r := range ln {
			body = append(body, byte(r), byte(r>>8))
		}
		if i < len(lines)-1 {
			body = append(body, 0x0A, 0x00)
		}
	}
	ccpText := len(body) / 2

	// WordDocument 流 = FIB(0x50) + 正文
	wd := make([]byte, 0x50+len(body))
	wd[0x0A] = 0x00 // fComplex = 0（正文连续，无需 piece table）
	wd[0x0C] = 0x02
	binary.LittleEndian.PutUint32(wd[0x4C:], uint32(ccpText))
	copy(wd[0x50:], body)

	cfb := buildTestCFB("WordDocument", wd)
	dir := t.TempDir()
	path := filepath.Join(dir, "test.doc")
	if err := os.WriteFile(path, cfb, 0644); err != nil {
		t.Fatal(err)
	}

	got, err := parseDoc(path)
	if err != nil {
		t.Fatalf("parseDoc 失败: %v", err)
	}
	// 诊断：直接取 OLE2 流看长度与 FIB
	f, _ := os.Open(path)
	wd2, _ := ole2.OpenStream(f, "WordDocument")
	f.Close()
	t.Logf("OLE2 WordDocument 流长度=%d（期望 %d）, cchText@0x4C=%d",
		len(wd2), 0x50+len(wd), binary.LittleEndian.Uint32(wd2[0x4C:0x50]))
	t.Log("抽出文本:", got)
	for _, want := range lines {
		if !bytesContainsRuneStr(got, want) {
			t.Errorf("缺少文本 %q，实际=%q", want, got)
		}
	}
}

// buildTestCFB 造 OLE2 容器（512B 扇区），含单个流
func buildTestCFB(streamName string, content []byte) []byte {
	const sec = 512
	out := make([]byte, 4*sec)
	off := 0
	copy(out[off:off+8], []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1})
	binary.LittleEndian.PutUint16(out[off+24:], 0x003E)
	binary.LittleEndian.PutUint16(out[off+28:], 9)
	binary.LittleEndian.PutUint32(out[off+44:], 1)
	binary.LittleEndian.PutUint32(out[off+76:], 1) // DIFAT[0]=FAT 在 sector1
	off += sec
	// sector0 目录
	writeDirItem(out[off:], 0, "Root Entry", 0xFFFFFFFF, 0)
	writeDirItem(out[off:], 128, streamName, 2, len(content))
	off += sec
	// sector1 FAT
	binary.LittleEndian.PutUint32(out[off+0:], 0xFFFFFFFE) // dir -> END
	binary.LittleEndian.PutUint32(out[off+4:], 0xFFFFFFFD) // FAT 自身
	binary.LittleEndian.PutUint32(out[off+8:], 0xFFFFFFFC) // data -> 结束
	off += sec
	// sector2 数据
	copy(out[off:off+sec], content)
	return out
}

func writeDirItem(b []byte, off int, name string, start, size int) {
	item := b[off : off+128]
	for i, c := range name {
		if i*2 >= 63 {
			break
		}
		item[i*2] = byte(c)
		item[i*2+1] = byte(c >> 8)
	}
	item[64] = 1
	if start == -1 {
		binary.LittleEndian.PutUint32(item[116:], 0xFFFFFFFE)
	} else {
		binary.LittleEndian.PutUint32(item[116:], uint32(start))
	}
	binary.LittleEndian.PutUint32(item[120:], uint32(size))
}

// 判断 UTF-16 解码后的字符串里是否包含目标中文子串
func bytesContainsRuneStr(s, sub string) bool {
	return len(s) >= len(sub) && indexOfStr(s, sub) >= 0
}
func indexOfStr(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
