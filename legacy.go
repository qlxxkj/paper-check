package main

import (
	"database/sql"

	"paper-check/internal/dedup"
	"paper-check/internal/db"
	"paper-check/internal/parser"
)

// parseAndInsertLegacy 解析并插入存量文档（不查重），对齐 main.ts 的 import-legacy-files/folder
func parseAndInsertLegacy(d *sql.DB, filePath string) (parser.ParsedResult, error) {
	parsed, err := parser.ParseWordFile(filePath, "")
	if err != nil {
		return parser.ParsedResult{}, err
	}
	doc := db.Document{
		FileName:       parsed.FileName,
		FilePath:       parsed.FilePath,
		FileSize:       parsed.FileSize,
		ParagraphCount: len(parsed.Paragraphs),
		WordCount:      len(parsed.FullText),
		FullTextHash:   "",
		IsSource:       1,
		RepeatStatus:   0,
		RepeatRate:     0,
		CreateTime:     parsed.CreateTime,
		ExcludedRefWords: 0,
	}
	docId, err := db.BatchInsertLegacyDocs(d, []db.Document{doc})
	if err != nil {
		return parser.ParsedResult{}, err
	}
	// 插入段落 + N-gram，使该文档能参与后续查重
	paras := make([]db.Paragraph, 0, len(parsed.Paragraphs))
	for idx, text := range parsed.Paragraphs {
		paras = append(paras, db.Paragraph{
			DocID:     docId,
			ParaIndex: idx + 1,
			ParaText:  text,
			ParaHash:  dedup.HashText(text),
			Length:    len(text),
		})
	}
	if err := db.InsertParagraphs(d, paras); err != nil {
		return parser.ParsedResult{}, err
	}
	if err := dedup.BuildNGramIndex(d, docId, parsed.Paragraphs, 16); err != nil {
		return parser.ParsedResult{}, err
	}
	return parsed, nil
}
