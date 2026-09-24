package db

import (
	"database/sql"
	"encoding/json"

	"paper-check/internal/dedup"
)

// 数据库模型层：函数签名对齐原 src/main/database/models.ts，SQL 语句原样保留，
// Go 侧统一返回 error（原 TS 侧静默失败处改为显式 error，由 handler 决定处理）。

// Document 对齐 shared/types.ts 的 Document 接口（JSON 字段名保持一致）
type Document struct {
	DocID            int     `json:"DocID"`
	FileName         string  `json:"FileName"`
	FilePath         string  `json:"FilePath"`
	FileSize         int64   `json:"FileSize"`
	ParagraphCount   int     `json:"ParagraphCount"`
	WordCount        int     `json:"WordCount"`
	FullTextHash     string  `json:"FullTextHash"`
	IsSource         int     `json:"IsSource"`
	RepeatStatus     int     `json:"RepeatStatus"`
	RepeatRate       float64 `json:"RepeatRate"`
	CreateTime       string  `json:"CreateTime"`
	ExcludedRefWords int     `json:"ExcludedRefWords"`
}

// Paragraph 对齐 shared/types.ts
type Paragraph struct {
	ParaID   int    `json:"ParaID"`
	DocID    int    `json:"DocID"`
	ParaIndex int    `json:"ParaIndex"`
	ParaText string `json:"ParaText"`
	ParaHash string `json:"ParaHash"`
	Length   int    `json:"Length"`
}

// 插入文档，返回新 DocID（对齐 insertDocument）
func InsertDocument(d *sql.DB, doc Document) (int, error) {
	res, err := d.Exec(`
    INSERT INTO Document
      (FileName, FilePath, FileSize, ParagraphCount, WordCount, FullTextHash, IsSource, RepeatStatus, RepeatRate, CreateTime, ExcludedRefWords)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		doc.FileName, doc.FilePath, doc.FileSize, doc.ParagraphCount, doc.WordCount,
		doc.FullTextHash, doc.IsSource, doc.RepeatStatus, doc.RepeatRate, doc.CreateTime, doc.ExcludedRefWords)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	return int(id), nil
}

// 批量插入段落 + ParaHashIndex（对齐 insertParagraphs，单事务）
func InsertParagraphs(d *sql.DB, paragraphs []Paragraph) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	insPara, err := tx.Prepare(`INSERT INTO Paragraph (DocID, ParaIndex, ParaText, ParaHash, Length) VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer insPara.Close()
	insIdx, err := tx.Prepare(`INSERT INTO ParaHashIndex (ParaHash, DocID, ParaIndex) VALUES (?, ?, ?)`)
	if err != nil {
		tx.Rollback()
		return err
	}
	for _, p := range paragraphs {
		if _, err := insPara.Exec(p.DocID, p.ParaIndex, p.ParaText, p.ParaHash, p.Length); err != nil {
			tx.Rollback()
			return err
		}
		if _, err := insIdx.Exec(p.ParaHash, p.DocID, p.ParaIndex); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// 获取源文档（对齐 getSourceDocs）
func GetSourceDocs(d *sql.DB) ([]Document, error) {
	rows, err := d.Query(`SELECT DocID, FileName, FilePath, FileSize, ParagraphCount, WordCount, FullTextHash, IsSource, RepeatStatus, RepeatRate, CreateTime, ExcludedRefWords FROM Document WHERE IsSource = 1 ORDER BY CreateTime DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanDocs(rows)
}

// 获取全部文档（对齐 getAllDocs）
func GetAllDocs(d *sql.DB) ([]Document, error) {
	rows, err := d.Query(`SELECT DocID, FileName, FilePath, FileSize, ParagraphCount, WordCount, FullTextHash, IsSource, RepeatStatus, RepeatRate, CreateTime, ExcludedRefWords FROM Document ORDER BY CreateTime DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanDocs(rows)
}

// 更新文档查重状态（对齐 updateDocRepeatStatus）
func UpdateDocRepeatStatus(d *sql.DB, docId, status int, rate float64) error {
	_, err := d.Exec(`UPDATE Document SET RepeatStatus = ?, RepeatRate = ? WHERE DocID = ?`, status, rate, docId)
	return err
}

// 标记单个文档为源（对齐 markAsSource）
func MarkAsSource(d *sql.DB, docId int) error {
	_, err := d.Exec(`UPDATE Document SET IsSource = 1 WHERE DocID = ?`, docId)
	return err
}

// 清空全部业务数据（对齐 deleteAllData）
func DeleteAllData(d *sql.DB) error {
	tables := []string{"RepeatRecord", "ParaHashIndex", "Paragraph", "NGramIndex", "DiffResult", "CheckLog", "Document"}
	for _, t := range tables {
		if _, err := d.Exec("DELETE FROM " + t); err != nil {
			return err
		}
	}
	return nil
}

// 重建所有文档 N-gram 索引（对齐 rebuildNGramIndex）
func RebuildNGramIndex(d *sql.DB, ngramLength int) (rebuilt int, skipped int, err error) {
	if _, err := d.Exec(`DELETE FROM NGramIndex`); err != nil {
		return 0, 0, err
	}
	docRows, err := d.Query(`SELECT DocID, FileName FROM Document`)
	if err != nil {
		return 0, 0, err
	}
	type docRow struct {
		DocID    int
		FileName string
	}
	var docs []docRow
	for docRows.Next() {
		var dr docRow
		if err := docRows.Scan(&dr.DocID, &dr.FileName); err != nil {
			docRows.Close()
			return 0, 0, err
		}
		docs = append(docs, dr)
	}
	docRows.Close()

	for _, doc := range docs {
		paras, err := d.Query(`SELECT ParaIndex, ParaText FROM Paragraph WHERE DocID = ? ORDER BY ParaIndex`, doc.DocID)
		if err != nil {
			skipped++
			continue
		}
		var paraTexts []string
		var paraIdx []int
		for paras.Next() {
			var pi int
			var pt string
			if err := paras.Scan(&pi, &pt); err != nil {
				paras.Close()
				skipped++
				break
			}
			paraIdx = append(paraIdx, pi)
			paraTexts = append(paraTexts, pt)
		}
		paras.Close()
		if len(paraTexts) == 0 {
			skipped++
			continue
		}

		tx, err := d.Begin()
		if err != nil {
			skipped++
			continue
		}
		ins, perr := tx.Prepare(`INSERT INTO NGramIndex (ngram, DocID, ParaIndex) VALUES (?, ?, ?)`)
		if perr != nil {
			tx.Rollback()
			skipped++
			continue
		}
		ok := true
		for i, pt := range paraTexts {
			clean := removeWhitespace(pt)
			for j := 0; j <= len(clean)-ngramLength; j++ {
				if _, e := ins.Exec(clean[j:j+ngramLength], doc.DocID, paraIdx[i]); e != nil {
					ok = false
					break
				}
			}
			if !ok {
				break
			}
		}
		ins.Close()
		if ok {
			if e := tx.Commit(); e == nil {
				rebuilt++
				continue
			}
			tx.Rollback()
			skipped++
			continue
		}
		tx.Rollback()
		skipped++
	}
	return
}

// 获取文档段落（对齐 getParagraphsByDoc）
func GetParagraphsByDoc(d *sql.DB, docId int) ([]Paragraph, error) {
	rows, err := d.Query(`SELECT ParaID, DocID, ParaIndex, ParaText, ParaHash, Length FROM Paragraph WHERE DocID = ? ORDER BY ParaIndex`, docId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Paragraph
	for rows.Next() {
		var p Paragraph
		if err := rows.Scan(&p.ParaID, &p.DocID, &p.ParaIndex, &p.ParaText, &p.ParaHash, &p.Length); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

// 删除单个文档及关联数据（对齐 deleteDoc）
func DeleteDoc(d *sql.DB, docId int) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	stmts := []string{
		`DELETE FROM RepeatRecord WHERE SourceDocID = ? OR TargetDocID = ?`,
		`DELETE FROM ParaHashIndex WHERE DocID = ?`,
		`DELETE FROM Paragraph WHERE DocID = ?`,
		`DELETE FROM NGramIndex WHERE DocID = ?`,
		`DELETE FROM Document WHERE DocID = ?`,
	}
	for _, s := range stmts {
		if _, err := tx.Exec(s, docId, docId, docId, docId, docId); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// 批量标记源文档（对齐 markDocsAsSource）
func MarkDocsAsSource(d *sql.DB, docIds []int) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
		stmt, perr := tx.Prepare(`UPDATE Document SET IsSource = 1 WHERE DocID = ?`)
		if perr != nil {
			tx.Rollback()
			return perr
		}
		defer stmt.Close()
	for _, id := range docIds {
		if _, err := stmt.Exec(id); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// 保存 Diff 结果（对齐 storeDiffResults）。接收 dedup.DiffResult，避免与 dedup 包重复定义。
func StoreDiffResults(d *sql.DB, docId1, docId2 int, results []dedup.DiffResult) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	stmt, perr := tx.Prepare(`INSERT INTO DiffResult (DocID1, DocID2, ParaIndex1, ParaIndex2, Highlights) VALUES (?, ?, ?, ?, ?)`)
	if perr != nil {
		tx.Rollback()
		return perr
	}
	defer stmt.Close()
	for _, r := range results {
		hl, err := json.Marshal(r.Highlights)
		if err != nil {
			tx.Rollback()
			return err
		}
		if _, err := stmt.Exec(docId1, docId2, r.ParaIndex1, r.ParaIndex2, string(hl)); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// 批量删除文档（对齐 batchDeleteDocs，单事务）
func BatchDeleteDocs(d *sql.DB, docIds []int) (successCount, failCount int, err error) {
	tx, err := d.Begin()
	if err != nil {
		return 0, 0, err
	}
	stmts := []string{
		`DELETE FROM RepeatRecord WHERE SourceDocID = ? OR TargetDocID = ?`,
		`DELETE FROM ParaHashIndex WHERE DocID = ?`,
		`DELETE FROM Paragraph WHERE DocID = ?`,
		`DELETE FROM DiffResult WHERE DocID1 = ? OR DocID2 = ?`,
		`DELETE FROM NGramIndex WHERE DocID = ?`,
		`DELETE FROM Document WHERE DocID = ?`,
	}
	for _, id := range docIds {
		inner := true
		for _, s := range stmts {
			args := []interface{}{id, id, id, id, id, id}
			if _, e := tx.Exec(s, args...); e != nil {
				inner = false
				break
			}
		}
		if inner {
			successCount++
		} else {
			failCount++
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}
	return
}

// 获取待确认文档（对齐 getPendingDocs）
func GetPendingDocs(d *sql.DB) ([]Document, error) {
	rows, err := d.Query(`SELECT DocID, FileName, FilePath, FileSize, ParagraphCount, WordCount, FullTextHash, IsSource, RepeatStatus, RepeatRate, CreateTime, ExcludedRefWords FROM Document WHERE IsSource = 0 AND RepeatStatus > 0 ORDER BY CreateTime DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanDocs(rows)
}

// 段落上下文（对齐 getParagraphContext，原 main.ts 实际查 BETWEEN 返回 ParaIndex+ParaText）
type ParaCtx struct {
	ParaIndex int    `json:"ParaIndex"`
	ParaText  string `json:"ParaText"`
}

// 获取段落上下文
func GetParagraphContext(d *sql.DB, docId, paraIndex, contextSize int) ([]ParaCtx, error) {
	start := paraIndex - contextSize
	if start < 1 {
		start = 1
	}
	end := paraIndex + contextSize
	rows, err := d.Query(`SELECT ParaIndex, ParaText FROM Paragraph WHERE DocID = ? AND ParaIndex BETWEEN ? AND ? ORDER BY ParaIndex`, docId, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ParaCtx
	for rows.Next() {
		var r ParaCtx
		if err := rows.Scan(&r.ParaIndex, &r.ParaText); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}

// 批量导入存量文档（对齐 batchInsertLegacyDocs），返回首个 DocID
func BatchInsertLegacyDocs(d *sql.DB, docs []Document) (int, error) {
	tx, err := d.Begin()
	if err != nil {
		return 0, err
	}
	stmt, perr := tx.Prepare(`
    INSERT INTO Document (FileName, FilePath, FileSize, ParagraphCount, WordCount, FullTextHash, IsSource, RepeatStatus, RepeatRate, CreateTime, ExcludedRefWords)
    VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?, 0)`)
	if perr != nil {
		tx.Rollback()
		return 0, perr
	}
	defer stmt.Close()
	firstDocId := 0
	for i, item := range docs {
		res, err := stmt.Exec(item.FileName, item.FilePath, item.FileSize, item.ParagraphCount, item.WordCount, item.FullTextHash, item.CreateTime)
		if err != nil {
			tx.Rollback()
			return 0, err
		}
		if i == 0 {
			id, _ := res.LastInsertId()
			firstDocId = int(id)
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return firstDocId, nil
}

// 读取检查日志（对齐 getCheckLogs）
func GetCheckLogs(d *sql.DB, limit int) ([]CheckLog, error) {
	rows, err := d.Query(`SELECT LogID, ExecTime, TotalFiles, SuccessCount, FailedCount, SkippedCount, FileList, Details FROM CheckLog ORDER BY ExecTime DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CheckLog
	for rows.Next() {
		var l CheckLog
		if err := rows.Scan(&l.LogID, &l.ExecTime, &l.TotalFiles, &l.SuccessCount, &l.FailedCount, &l.SkippedCount, &l.FileList, &l.Details); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, nil
}

// 写入检查日志（对齐 insertCheckLog），返回 LogID
func InsertCheckLog(d *sql.DB, log CheckLog) (int, error) {
	res, err := d.Exec(`
    INSERT INTO CheckLog (ExecTime, TotalFiles, SuccessCount, FailedCount, SkippedCount, FileList, Details)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
		log.ExecTime, log.TotalFiles, log.SuccessCount, log.FailedCount, log.SkippedCount, log.FileList, log.Details)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	return int(id), nil
}

// CheckLog 对齐数据库表
type CheckLog struct {
	LogID        int    `json:"LogID"`
	ExecTime     string `json:"ExecTime"`
	TotalFiles   int    `json:"TotalFiles"`
	SuccessCount int    `json:"SuccessCount"`
	FailedCount  int    `json:"FailedCount"`
	SkippedCount int    `json:"SkippedCount"`
	FileList     string `json:"FileList"`
	Details      string `json:"Details"`
}

// DiffResult 和 HighlightSegment 统一在 dedup 包定义（与前端 JSON 对齐），
// 这里不再重复定义，StoreDiffResults 直接接收 dedup 类型。

// removeWhitespace 对齐 TS 的 text.replace(/\s+/g, '')
func removeWhitespace(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		switch r {
		case ' ', '\t', '\n', '\r', '\v', '\f', 0x85, 0xA0, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F:
			continue
		default:
			out = append(out, r)
		}
	}
	return string(out)
}

// scanDocs 扫描 Document 行
func scanDocs(rows *sql.Rows) ([]Document, error) {
	var out []Document
	for rows.Next() {
		var d Document
		var fileSize int64
		if err := rows.Scan(&d.DocID, &d.FileName, &d.FilePath, &fileSize, &d.ParagraphCount, &d.WordCount, &d.FullTextHash, &d.IsSource, &d.RepeatStatus, &d.RepeatRate, &d.CreateTime, &d.ExcludedRefWords); err != nil {
			return nil, err
		}
		d.FileSize = fileSize
		out = append(out, d)
	}
	return out, nil
}
