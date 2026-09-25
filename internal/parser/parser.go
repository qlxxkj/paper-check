package parser

import (
	"archive/zip"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// ParsedResult 对齐 src/main/parser/wordParser.ts 的 ParsedResult 接口
type ParsedResult struct {
	FileName   string `json:"fileName"`
	FilePath   string `json:"filePath"`
	FileSize   int64  `json:"fileSize"`
	FullText   string `json:"fullText"`
	Paragraphs []string `json:"paragraphs"`
	CreateTime string `json:"createTime"`
	ModifyTime string `json:"modifyTime"`
}

// docx 段落文本抽出的 XML 结构（document.xml 中的 w:p / w:t）
type wordDocument struct {
	Body wordBody `xml:"body"`
}
type wordBody struct {
	Paragraphs []wordParagraph `xml:"p"`
}
type wordParagraph struct {
	Runs []wordRun `xml:"r"`
}
type wordRun struct {
	Texts []wordText `xml:"t"`
}
type wordText struct {
	Value string `xml:",chardata"`
}

// 解析 Word/PDF 文件（对齐 parseWordFile）。
// .docx → 标准库解 zip + 解 XML 抽段落文本（等价 mammoth.extractRawText 的输出）
// .doc  → 旧版 OLE2 二进制格式，无跨平台纯 Go 解析库；提示用户转存为 .docx
// .pdf  → 不支持（原实现即 throw）
func ParseWordFile(filePath string) (ParsedResult, error) {
	ext := strings.ToLower(filepath.Ext(filePath))
	var text string
	var paragraphs []string

	switch ext {
	case ".docx":
		t, err := parseDocx(filePath)
		if err != nil {
			return ParsedResult{}, err
		}
		text = t
		paragraphs = splitParagraphs(t)
	case ".pdf":
		return ParsedResult{}, fmt.Errorf("不支持pdf的文件格式")
	case ".doc":
		// 旧版 Word 二进制格式（OLE2）。纯 Go 解析 WordDocument 流的正文，
		// 跨平台无外部依赖（见 doc.go / internal/ole2）。
		t, err := parseDoc(filePath)
		if err != nil {
			return ParsedResult{}, fmt.Errorf("旧版 .doc 解析失败: %w", err)
		}
		text = t
		paragraphs = splitParagraphs(t)
	default:
		return ParsedResult{}, fmt.Errorf("不支持的文件格式: %s", ext)
	}

	info, err := os.Stat(filePath)
	if err != nil {
		return ParsedResult{}, err
	}
	return ParsedResult{
		FileName:   filepath.Base(filePath),
		FilePath:   filePath,
		FileSize:   info.Size(),
		FullText:   text,
		Paragraphs: paragraphs,
		CreateTime: info.ModTime().Format("2006-01-02T15:04:05.000Z"),
		ModifyTime: info.ModTime().Format("2006-01-02T15:04:05.000Z"),
	}, nil
}

// 按空行（两个及以上换行）拆段（对齐原 text.split(/\r?\n\r?\n/)）
func splitParagraphs(text string) []string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	parts := strings.Split(text, "\n\n")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

// parseDocx 解包 docx zip，读 word/document.xml，按段落拼接 run 文本
func parseDocx(filePath string) (string, error) {
	r, err := zip.OpenReader(filePath)
	if err != nil {
		return "", fmt.Errorf(".docx 解析失败（不是有效 zip）: %w", err)
	}
	defer r.Close()
	var xmlData []byte
	for _, f := range r.File {
		if f.Name == "word/document.xml" {
			rc, err := f.Open()
			if err != nil {
				return "", err
			}
			xmlData, err = io.ReadAll(rc)
			rc.Close()
			if err != nil {
				return "", err
			}
			break
		}
	}
	if xmlData == nil {
		return "", fmt.Errorf(".docx 缺少 word/document.xml")
	}
	var doc wordDocument
	if err := xml.Unmarshal(xmlData, &doc); err != nil {
		return "", fmt.Errorf(".docx 解析 XML 失败: %w", err)
	}
	var sb strings.Builder
	for i, p := range doc.Body.Paragraphs {
		for _, run := range p.Runs {
			for _, t := range run.Texts {
				sb.WriteString(t.Value)
			}
		}
		if i < len(doc.Body.Paragraphs)-1 {
			sb.WriteString("\n")
		}
	}
	return sb.String(), nil
}

// 去除文末参考文献（对齐 src/main/parser/refFilter.ts 的 filterReferences）
// 返回清理后的正文 + 被排除的字符数。原 TS 匹配"参考文献"/"REFERENCES"/"[1]"三处的最早出现位置
func FilterReferences(text string) (cleanText string, excludedCount int) {
	refs := []string{"参考文献", "REFERENCES", "[1]"}
	bestIndex := -1
	for _, kw := range refs {
		idx := strings.Index(text, kw)
		if idx >= 0 && (bestIndex == -1 || idx < bestIndex) {
			bestIndex = idx
		}
	}
	if bestIndex == -1 {
		return text, 0
	}
	return text[:bestIndex], len(text) - bestIndex
}
