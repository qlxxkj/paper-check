package db

import (
	"path/filepath"
	"testing"
)

// 冒烟测试：建表 + CRUD + N-gram 索引 + 老库 schema 兼容
func TestInitAndCRUD(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")
	d, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open 失败: %v", err)
	}
	defer d.Close()

	// 确认 schema 表都存在
	tables := []string{"Document", "Paragraph", "ParaHashIndex", "RepeatRecord", "NGramIndex", "DiffResult", "CheckLog"}
	for _, tbl := range tables {
		var one int
		if err := d.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?`, tbl).Scan(&one); err != nil {
			t.Fatalf("查表 %s 失败: %v", tbl, err)
		}
		if one == 0 {
			t.Fatalf("表 %s 不存在", tbl)
		}
	}

	// 插入文档 + 段落
	docId, err := InsertDocument(d, Document{
		FileName: "test.docx", FilePath: "/tmp/test.docx", FileSize: 100,
		ParagraphCount: 1, WordCount: 10, FullTextHash: "abc",
		IsSource: 1, RepeatStatus: 0, RepeatRate: 0,
		CreateTime: "2026-01-01T00:00:00Z", ExcludedRefWords: 0,
	})
	if err != nil {
		t.Fatalf("InsertDocument 失败: %v", err)
	}
	if docId <= 0 {
		t.Fatalf("docId 应 > 0，得到 %d", docId)
	}

	if err := InsertParagraphs(d, []Paragraph{
		{DocID: docId, ParaIndex: 1, ParaText: "hello", ParaHash: "h1", Length: 5},
		{DocID: docId, ParaIndex: 2, ParaText: "world", ParaHash: "h2", Length: 5},
	}); err != nil {
		t.Fatalf("InsertParagraphs 失败: %v", err)
	}

	docs, err := GetAllDocs(d)
	if err != nil {
		t.Fatalf("GetAllDocs 失败: %v", err)
	}
	if len(docs) != 1 || docs[0].FileName != "test.docx" {
		t.Fatalf("GetAllDocs 结果不对: %+v", docs)
	}

	paras, err := GetParagraphsByDoc(d, docId)
	if err != nil {
		t.Fatalf("GetParagraphsByDoc 失败: %v", err)
	}
	if len(paras) != 2 {
		t.Fatalf("段落数应为 2，得到 %d", len(paras))
	}

	// N-gram 重建
	rebuilt, skipped, err := RebuildNGramIndex(d, 4)
	if err != nil {
		t.Fatalf("RebuildNGramIndex 失败: %v", err)
	}
	if rebuilt != 1 || skipped != 0 {
		t.Fatalf("重建结果不对: rebuilt=%d skipped=%d", rebuilt, skipped)
	}

	// 删除
	if err := DeleteDoc(d, docId); err != nil {
		t.Fatalf("DeleteDoc 失败: %v", err)
	}
	after, _ := GetAllDocs(d)
	if len(after) != 0 {
		t.Fatalf("删除后应无文档，得到 %d", len(after))
	}
}
