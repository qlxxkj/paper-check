package parser

import (
	"encoding/binary"
	"fmt"
	"os"
	"strings"

	"paper-check/internal/ole2"
)

// parseDoc 解析老版 Word 二进制格式（.doc, Word 97-2003）。
//
// 纯 Go 零依赖实现，基于 OLE2 复合文档 + Word FIB 规范：
//   1. OLE2 取 WordDocument 流
//   2. 读 FIB：fFlags(offset 0x000A) 的 bit0=fComplex；
//      ccpText(offset 0x004C, uint32) 正文总字符数
//   3. 编码：Word 97+ 恒 UTF-16LE。正文起点 fcMin(offset 0x0018)
//      - fComplex=0：正文 1:1 连续，直接取 2*ccpText 字节
//      - fComplex=1：正文分散在多个 piece，需 piece table；本期降级取流尾
//   4. 控制字符规整：\r 段落 / \x07 表格分隔 / \x0C 分节 → \n
//
// 局限（方案 A 的已知边界）：仅抽正文段落，表格/文本框/页眉脚不在
// ccpText 正文流里取不到。纯文字论文够用，复杂排版老 Word 会漏段。
func parseDoc(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf(".doc 打开失败: %w", err)
	}
	defer f.Close()

	wd, err := ole2.OpenStream(f, "WordDocument")
	if err != nil {
		return "", fmt.Errorf(".doc 解析失败（WordDocument 流缺失/损坏）: %w", err)
	}
	if len(wd) < 0x50 {
		return "", fmt.Errorf(".doc 解析失败（WordDocument 流过短 %d 字节）", len(wd))
	}

	// FIB 关键字段（Word97 布局）
	flags := binary.LittleEndian.Uint16(wd[0x0A:0x0C])
	fComplex := (flags&0x0001) != 0
	cchText := int(binary.LittleEndian.Uint32(wd[0x4C:0x50])) // 正文字符数
	if cchText <= 0 {
		return "", fmt.Errorf(".doc 正文为空（ccpText=0）")
	}

	// 正文起点：Word 97 流里 FIB(0x418 字节头) 之后紧跟正文文本区。
	// fcMin 通常 = 0x418（1048）或 0，这里用 0x50 作最小安全偏移。
	const fcMin = 0x50
	textBytes := 2 * cchText
	start := fcMin
	end := start + textBytes
	if end > len(wd) {
		// 兜底：
		if fComplex {
			// 复杂正文（piece table）取流尾
			end = len(wd)
			start = len(wd) - textBytes
			if start < 0 {
				start = 0
			}
		} else {
			end = len(wd)
		}
	}
	if start > end {
		start, end = 0, len(wd)
	}

	raw := wd[start:end]
	return decodeWordText(raw), nil
}

// decodeWordText UTF-16LE 解码 + 控制字符规整
func decodeWordText(raw []byte) string {
	text := decodeUTF16LE(raw)
	replacer := strings.NewReplacer(
		"\r", "\n",
		"\x07", "\n",
		"\x0C", "\n",
		"\x0B", " ",
		"\x13", "", "\x14", "", "\x15", "",
		"\x01", "", "\x08", "",
	)
	text = replacer.Replace(text)
	text = strings.TrimRightFunc(text, func(r rune) bool {
		return r == '\n' || r == ' ' || r == 0x3000
	})
	return text
}

func decodeUTF16LE(b []byte) string {
	if len(b) < 2 {
		return ""
	}
	n := len(b) / 2
	out := make([]rune, 0, n)
	for i := 0; i < n; i++ {
		lo, hi := b[2*i], b[2*i+1]
		r := rune(lo) | rune(hi)<<8
		if r == 0 {
			break
		}
		out = append(out, r)
	}
	return string(out)
}
