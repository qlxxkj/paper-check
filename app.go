package main

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pkg/browser"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"paper-check/internal/backup"
	"paper-check/internal/config"
	"paper-check/internal/dedup"
	"paper-check/internal/db"
	"paper-check/internal/importsvc"
)

// App Wails 主结构体。导出方法即前端可调用接口（window.go.main.App.XXX）
type App struct {
	ctx      context.Context
	db       *sql.DB
	cfg      config.AppConfig
	importer *importsvc.ImportService
	dbPath   string
}

// NewApp 创建应用
func NewApp() *App {
	return &App{}
}

// startup 应用启动回调（保存 context 用于 runtime 调用）
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.initApp()
}

// shutdown 应用关闭回调
func (a *App) shutdown(ctx context.Context) {
	if a.db != nil {
		a.db.Close()
	}
}

// 初始化数据库 + 配置 + 导入服务
func (a *App) initApp() {
	a.dbPath = a.databasePath()
	d, err := db.Open(a.dbPath)
	if err != nil {
		panic(fmt.Sprintf("数据库初始化失败: %v", err))
	}
	a.db = d
	a.cfg = config.LoadConfig()
	a.importer = importsvc.New(d, a.cfg, a.emitProgress)
}

// 数据库路径：开发用 ./databases/app.db
func (a *App) databasePath() string {
	return filepath.Join("databases", "app.db")
}

// emitProgress 推送进度事件给前端
func (a *App) emitProgress(event string, payload any) {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, event, payload)
	}
}

// ====== 文件对话框（对齐 open-file-dialog / save-file-dialog）======

// OpenFileDialog 打开文件选择对话框，返回所选路径（对齐 open-file-dialog）
func (a *App) OpenFileDialog() []string {
	if a.ctx == nil {
		return nil
	}
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择 Word 文档",
	})
	if err != nil {
		return nil
	}
	return paths
}

// SaveFileDialog 保存文件对话框，返回路径（取消返回空串）
func (a *App) SaveFileDialog(defaultPath string) string {
	if a.ctx == nil {
		return ""
	}
	p, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultPath,
	})
	if err != nil {
		return ""
	}
	return p
}

// OpenDoc 用系统默认程序打开文件（对齐 open-doc / shell.openPath）
// 使用 pkg/browser（跨平台：Windows 用 rundll32、macOS 用 open、Linux 用 xdg-open）
func (a *App) OpenDoc(filePath string) map[string]interface{} {
	if err := browser.OpenFile(filePath); err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{"success": true}
}

// ====== 文档查询（对齐 get-all-docs / get-source-docs / get-pending-docs）======

// GetAllDocs 返回全部文档
func (a *App) GetAllDocs() ([]db.Document, error) {
	return db.GetAllDocs(a.db)
}

// GetSourceDocs 返回源文档
func (a *App) GetSourceDocs() ([]db.Document, error) {
	return db.GetSourceDocs(a.db)
}

// GetPendingDocs 返回待确认文档
func (a *App) GetPendingDocs() ([]db.Document, error) {
	return db.GetPendingDocs(a.db)
}

// GetDocParagraphs 返回文档段落
func (a *App) GetDocParagraphs(docId int) ([]db.Paragraph, error) {
	return db.GetParagraphsByDoc(a.db, docId)
}

// GetParagraphContext 返回段落上下文（ParaIndex, ParaText 对）
func (a *App) GetParagraphContext(docId, paraIndex, contextSize int) ([]db.ParaCtx, error) {
	return db.GetParagraphContext(a.db, docId, paraIndex, contextSize)
}

// ====== 查重（对齐 get-repeat-relations / get-duplicate-paragraphs）======

// GetRepeatRelations 计算文档与所有源文档的重复率，按重复率降序
func (a *App) GetRepeatRelations(docId int) ([]map[string]interface{}, error) {
	minShared := a.cfg.MinSharedNgrams
	if minShared == 0 {
		minShared = 5
	}
	// 当前文档的 N-gram
	ngramRows, err := a.db.Query(`SELECT DISTINCT ngram FROM NGramIndex WHERE DocID = ?`, docId)
	if err != nil {
		return nil, err
	}
	var ngrams []string
	for ngramRows.Next() {
		var ng string
		if err := ngramRows.Scan(&ng); err != nil {
			ngramRows.Close()
			return nil, err
		}
		ngrams = append(ngrams, ng)
	}
	ngramRows.Close()
	if len(ngrams) == 0 {
		return []map[string]interface{}{}, nil
	}

	// 找共享 N-gram 的候选文档
	placeholders := make([]string, len(ngrams))
	args := make([]interface{}, 0, len(ngrams)+1)
	for i, ng := range ngrams {
		placeholders[i] = "?"
		args = append(args, ng)
	}
	args = append(args, docId)
	relSQL := `SELECT d.DocID, d.FileName, d.RepeatRate, d.RepeatStatus FROM Document d
		INNER JOIN NGramIndex idx ON d.DocID = idx.DocID
		WHERE idx.ngram IN (` + strings.Join(placeholders, ",") + `)
		AND d.DocID != ?
		GROUP BY d.DocID
		HAVING COUNT(DISTINCT idx.ngram) >= ?
		ORDER BY d.CreateTime ASC`
	relRows, err := a.db.Query(relSQL, args...)
	if err != nil {
		return nil, err
	}
	defer relRows.Close()
	var targetIds []int
	var rows []struct {
		DocID        int
		FileName     string
		RepeatRate   float64
		RepeatStatus int
	}
	for relRows.Next() {
		var r struct {
			DocID        int
			FileName     string
			RepeatRate   float64
			RepeatStatus int
		}
		if err := relRows.Scan(&r.DocID, &r.FileName, &r.RepeatRate, &r.RepeatStatus); err != nil {
			return nil, err
		}
		rows = append(rows, r)
		targetIds = append(targetIds, r.DocID)
	}
	if len(rows) == 0 {
		return []map[string]interface{}{}, nil
	}

	// 批量取相关文档段落哈希
	p2 := make([]string, len(targetIds))
	pArgs := make([]interface{}, len(targetIds))
	for i, id := range targetIds {
		p2[i] = "?"
		pArgs[i] = id
	}
	paraSQL := `SELECT DocID, ParaHash, Length FROM Paragraph WHERE DocID IN (` + strings.Join(p2, ",") + `)`
	paraRows, err := a.db.Query(paraSQL, pArgs...)
	if err != nil {
		return nil, err
	}
	paraByDoc := map[int][]struct {
		Hash   string
		Length int
	}{}
	for paraRows.Next() {
		var did int
		var hash string
		var l int
		if err := paraRows.Scan(&did, &hash, &l); err != nil {
			paraRows.Close()
			return nil, err
		}
		paraByDoc[did] = append(paraByDoc[did], struct {
			Hash   string
			Length int
		}{hash, l})
	}
	paraRows.Close()

	// 当前文档段落
	curRows, err := a.db.Query(`SELECT ParaHash, Length FROM Paragraph WHERE DocID = ?`, docId)
	if err != nil {
		return nil, err
	}
	type para struct {
		Hash   string
		Length int
	}
	var curParas []para
	for curRows.Next() {
		var p para
		if err := curRows.Scan(&p.Hash, &p.Length); err != nil {
			curRows.Close()
			return nil, err
		}
		curParas = append(curParas, p)
	}
	curRows.Close()

	results := make([]map[string]interface{}, 0, len(rows))
	for _, r := range rows {
		targets := paraByDoc[r.DocID]
		hashSet := map[string]struct{}{}
		for _, p := range targets {
			hashSet[p.Hash] = struct{}{}
		}
		repeatWords, repeatParas := 0, 0
		totalWords := 0
		for _, p := range curParas {
			if _, ok := hashSet[p.Hash]; ok {
				repeatWords += p.Length
				repeatParas++
			}
			totalWords += p.Length
		}
		pairRate := 0.0
		if totalWords > 0 {
			pairRate = float64(repeatWords) / float64(totalWords)
		}
		results = append(results, map[string]interface{}{
			"DocID":                    r.DocID,
			"FileName":                 r.FileName,
			"RepeatRate":               r.RepeatRate,
			"RepeatStatus":             r.RepeatStatus,
			"pairRepeatRate":           pairRate,
			"duplicateParagraphCount":  repeatParas,
		})
	}
	// 降序
	for i := 0; i < len(results); i++ {
		for j := i + 1; j < len(results); j++ {
			if results[j]["pairRepeatRate"].(float64) > results[i]["pairRepeatRate"].(float64) {
				results[i], results[j] = results[j], results[i]
			}
		}
	}
	return results, nil
}

// GetDuplicateParagraphs 取两个文档的 Diff 高亮（优先缓存，否则实时计算）
func (a *App) GetDuplicateParagraphs(docId1, docId2 int) ([]dedup.DiffResult, error) {
	// 1. 查缓存（正向）
	cached, err := a.queryDiffCache(docId1, docId2)
	if err == nil && len(cached) > 0 {
		return cached, nil
	}
	// 2. 反向查缓存
	swapped, err := a.queryDiffCache(docId2, docId1)
	if err == nil && len(swapped) > 0 {
		return swapped, nil
	}
	// 3. 实时计算
	return dedup.CompareDocs(a.db, docId1, docId2, 0.001)
}

// queryDiffCache 从 DB 读已存的 Diff 结果
func (a *App) queryDiffCache(id1, id2 int) ([]dedup.DiffResult, error) {
	rows, err := a.db.Query(`
		SELECT dr.DocID1, dr.DocID2, dr.ParaIndex1, dr.ParaIndex2, dr.Highlights,
		       p1.ParaText as doc1ParaText, p2.ParaText as doc2ParaText
		FROM DiffResult dr
		JOIN Paragraph p1 ON dr.DocID1 = p1.DocID AND dr.ParaIndex1 = p1.ParaIndex
		JOIN Paragraph p2 ON dr.DocID2 = p2.DocID AND dr.ParaIndex2 = p2.ParaIndex
		WHERE dr.DocID1 = ? AND dr.DocID2 = ?
		ORDER BY dr.ParaIndex1`, id1, id2)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dedup.DiffResult
	for rows.Next() {
		var dr dedup.DiffResult
		var hlJSON string
		if err := rows.Scan(&dr.DocID1, &dr.DocID2, &dr.ParaIndex1, &dr.ParaIndex2, &hlJSON, &dr.Doc1ParaText, &dr.Doc2ParaText); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(hlJSON), &dr.Highlights); err != nil {
			return nil, err
		}
		out = append(out, dr)
	}
	return out, nil
}

// ====== 删除 / 标记（对齐 delete-doc / batch-delete / batch-mark-source）======

// DeleteDoc 删除单个文档
func (a *App) DeleteDoc(docId int) bool {
	return db.DeleteDoc(a.db, docId) == nil
}

// BatchDelete 批量删除
func (a *App) BatchDelete(docIds []int) map[string]int {
	success, fail, _ := db.BatchDeleteDocs(a.db, docIds)
	return map[string]int{"successCount": success, "failCount": fail}
}

// BatchMarkSource 批量标记源文档
func (a *App) BatchMarkSource(docIds []int) map[string]interface{} {
	if err := db.MarkDocsAsSource(a.db, docIds); err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{"success": true}
}

// ====== 导入（对齐 import-files / import-folder / import-mixed / import-legacy-*）======

// ImportFiles 导入文件列表（带查重）
func (a *App) ImportFiles(filePaths []string) importsvc.ImportResult {
	res := a.importer.Run(a.ctx, filePaths)
	a.logCheck(filePaths, res)
	return res
}

// ImportFolder 递归导入文件夹
func (a *App) ImportFolder(folderPath string) importsvc.ImportResult {
	files := scanWordFiles(folderPath)
	if len(files) == 0 {
		return importsvc.ImportResult{}
	}
	res := a.importer.Run(a.ctx, files)
	a.logCheck(files, res)
	return res
}

// ImportMixed 混合导入（文件 + 文件夹）
func (a *App) ImportMixed(paths []string) importsvc.ImportResult {
	var all []string
	for _, p := range paths {
		info, err := os.Stat(p)
		if err != nil {
			continue
		}
		if info.IsDir() {
			all = append(all, scanWordFiles(p)...)
		} else if strings.HasSuffix(strings.ToLower(p), ".docx") || strings.HasSuffix(strings.ToLower(p), ".doc") || strings.HasSuffix(strings.ToLower(p), ".pdf") {
			all = append(all, p)
		}
	}
	res := a.importer.Run(a.ctx, all)
	a.logCheck(all, res)
	return res
}

// ImportLegacyFiles 存量导入（不查重）
func (a *App) ImportLegacyFiles(filePaths []string) []map[string]interface{} {
	var results []map[string]interface{}
	for _, filePath := range filePaths {
		if _, err := parseAndInsertLegacy(a.db, filePath); err != nil {
			results = append(results, map[string]interface{}{"filePath": filePath, "status": "failed", "error": err.Error()})
			continue
		}
		results = append(results, map[string]interface{}{"filePath": filePath, "status": "success"})
	}
	return results
}

// ImportLegacyFolder 存量导入文件夹（不查重，带进度推送）
func (a *App) ImportLegacyFolder(folderPath string) []map[string]interface{} {
	files := scanWordFiles(folderPath)
	a.emitProgress("import-progress", importsvc.Progress{Type: "start", Total: len(files), Status: "扫描文件夹..."})
	var results []map[string]interface{}
	success, failed := 0, 0
	for i, filePath := range files {
		a.emitProgress("import-progress", importsvc.Progress{Type: "progress", File: filepath.Base(filePath), Index: i, Total: len(files), Status: "解析中..."})
		if _, err := parseAndInsertLegacy(a.db, filePath); err != nil {
			failed++
			results = append(results, map[string]interface{}{"filePath": filePath, "status": "failed", "error": err.Error()})
		} else {
			success++
			results = append(results, map[string]interface{}{"filePath": filePath, "status": "success"})
		}
		a.emitProgress("import-progress", importsvc.Progress{Type: "progress", File: filepath.Base(filePath), Index: i, Total: len(files), Status: "完成", Success: success, Failed: failed})
	}
	a.emitProgress("import-progress", importsvc.Progress{Type: "done", Success: success, Failed: failed})
	return results
}

// 写入导入操作日志
func (a *App) logCheck(filePaths []string, res importsvc.ImportResult) {
	now := time.Now().Format(time.RFC3339)
	_, _ = db.InsertCheckLog(a.db, db.CheckLog{
		ExecTime: now, TotalFiles: res.Success + res.Failed + res.Skipped,
		SuccessCount: res.Success, FailedCount: res.Failed, SkippedCount: res.Skipped,
		FileList: fmt.Sprintf("%v", filePaths), Details: "导入文件",
	})
}

// scanWordFiles 递归扫描 .docx/.doc
func scanWordFiles(dir string) []string {
	var results []string
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			return nil
		}
		name := strings.ToLower(info.Name())
		if strings.HasSuffix(name, ".docx") || strings.HasSuffix(name, ".doc") || strings.HasSuffix(name, ".pdf") {
			results = append(results, path)
		}
		return nil
	})
	return results
}

// ====== 备份 / 恢复 / 清空（对齐 backup-db / restore-db / clear-all）======

// BackupDB 备份数据库到指定目录
func (a *App) BackupDB() map[string]interface{} {
	var destDir string
	if a.ctx != nil {
		var err error
		destDir, err = runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
			Title: "选择备份目录",
		})
		if err != nil {
			return map[string]interface{}{"success": false, "error": err.Error()}
		}
	}
	if destDir == "" {
		return map[string]interface{}{"success": false, "canceled": true}
	}
	if backup.BackupDB(a.dbPath, destDir) {
		return map[string]interface{}{"success": true}
	}
	return map[string]interface{}{"success": false}
}

// RestoreDB 从备份恢复
func (a *App) RestoreDB(backupPath string) bool {
	a.db.Close()
	if ok := backup.RestoreDB(backupPath, a.dbPath); !ok {
		a.initApp()
		return false
	}
	a.initApp()
	return true
}

// ClearAll 清空全部数据
func (a *App) ClearAll() bool {
	return db.DeleteAllData(a.db) == nil
}

// RebuildNGramIndex 重建 N-gram 索引
func (a *App) RebuildNGramIndex() map[string]int {
	rebuilt, skipped, err := db.RebuildNGramIndex(a.db, a.cfg.NgramLength)
	if err != nil {
		return map[string]int{"rebuilt": 0, "skipped": -1}
	}
	return map[string]int{"rebuilt": rebuilt, "skipped": skipped}
}

// ====== 导出（对齐 export-docs-zip / export-data-zip）======

// ExportDocsZip 导出源文档为 zip
func (a *App) ExportDocsZip(docIds []int) map[string]interface{} {
	rows, err := a.db.Query(`SELECT FilePath, FileName FROM Document WHERE DocID IN (` + placeholders(docIds) + `) AND IsSource = 1`, toArgs(docIds)...)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	type f struct {
		FilePath string
		FileName string
	}
	var files []f
	for rows.Next() {
		var ff f
		if err := rows.Scan(&ff.FilePath, &ff.FileName); err != nil {
			rows.Close()
			return map[string]interface{}{"success": false, "error": err.Error()}
		}
		files = append(files, ff)
	}
	rows.Close()
	if len(files) == 0 {
		return map[string]interface{}{"success": false, "error": "没有找到可导出的源文档"}
	}
	buf := &bytes.Buffer{}
	zw := zip.NewWriter(buf)
	for _, ff := range files {
		data, err := os.ReadFile(ff.FilePath)
		if err != nil {
			continue
		}
		w, err := zw.Create(ff.FileName)
		if err != nil {
			continue
		}
		w.Write(data)
	}
	zw.Close()

	var savePath string
	if a.ctx != nil {
		savePath, _ = runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
			DefaultFilename: fmt.Sprintf("文档导出_%s.zip", time.Now().Format("2006-01-02")),
		})
	}
	if savePath == "" {
		return map[string]interface{}{"success": false, "canceled": true}
	}
	if err := os.WriteFile(savePath, buf.Bytes(), 0o644); err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{"success": true, "path": savePath}
}

// ExportDataZip 导出 CSV + 文档 zip
func (a *App) ExportDataZip(docIds []int) map[string]interface{} {
	rows, err := a.db.Query(`SELECT DocID, FileName, FilePath, ParagraphCount, WordCount, RepeatRate, RepeatStatus, IsSource, CreateTime
		FROM Document WHERE DocID IN (` + placeholders(docIds) + `) AND IsSource = 1`, toArgs(docIds)...)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	type doc struct {
		DocID, ParaCount, WordCount, Status, IsSource int
		FileName, FilePath, CreateTime               string
		RepeatRate                                   float64
	}
	var docs []doc
	for rows.Next() {
		var d doc
		if err := rows.Scan(&d.DocID, &d.FileName, &d.FilePath, &d.ParaCount, &d.WordCount, &d.RepeatRate, &d.Status, &d.IsSource, &d.CreateTime); err != nil {
			rows.Close()
			return map[string]interface{}{"success": false, "error": err.Error()}
		}
		docs = append(docs, d)
	}
	rows.Close()
	if len(docs) == 0 {
		return map[string]interface{}{"success": false, "error": "没有可导出的源文档"}
	}

	// 生成 CSV
	csvBuf := &bytes.Buffer{}
	w := csv.NewWriter(csvBuf)
	w.Write([]string{"序号", "文件名", "段落数", "总字数", "重复率", "状态", "是否源文档", "导入时间"})
	for i, d := range docs {
		status := []string{"无重复", "部分重复", "完全重复"}
		if d.Status >= 0 && d.Status < 3 {
			w.Write([]string{
				fmt.Sprintf("%d", i+1), d.FileName,
				fmt.Sprintf("%d", d.ParaCount), fmt.Sprintf("%d", d.WordCount),
				fmt.Sprintf("%.1f%%", d.RepeatRate*100), status[d.Status],
				"否", d.CreateTime,
			})
		}
	}
	w.Flush()
	csvContent := csvBuf.String()
	// 加 BOM（Excel 兼容）
	csvBytes := append([]byte{0xEF, 0xBB, 0xBF}, []byte(csvContent)...)

	// 文档 zip
	docZipBuf := &bytes.Buffer{}
	zw := zip.NewWriter(docZipBuf)
	for _, d := range docs {
		data, err := os.ReadFile(d.FilePath)
		if err != nil {
			continue
		}
		ww, _ := zw.Create(d.FileName)
		ww.Write(data)
	}
	zw.Close()

	// 最终 zip
	finalBuf := &bytes.Buffer{}
	zw2 := zip.NewWriter(finalBuf)
	ww, _ := zw2.Create("统计信息.csv")
	ww.Write(csvBytes)
	ww2, _ := zw2.Create("文档原文.zip")
	ww2.Write(docZipBuf.Bytes())
	zw2.Close()

	var savePath string
	if a.ctx != nil {
		savePath, _ = runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
			DefaultFilename: fmt.Sprintf("导出数据_%s.zip", time.Now().Format("2006-01-02")),
		})
	}
	if savePath == "" {
		return map[string]interface{}{"success": false, "canceled": true}
	}
	if err := os.WriteFile(savePath, finalBuf.Bytes(), 0o644); err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{"success": true, "path": savePath}
}

// ====== 配置（对齐 getConfig / saveConfig）======

// GetConfig 返回当前配置
func (a *App) GetConfig() config.AppConfig {
	return a.cfg
}

// SaveConfig 保存配置
func (a *App) SaveConfig(cfg config.AppConfig) map[string]interface{} {
	if err := config.SaveConfig(cfg); err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	a.cfg = cfg
	return map[string]interface{}{"success": true}
}

// GetCheckLogs 读取检查日志
func (a *App) GetCheckLogs() ([]db.CheckLog, error) {
	return db.GetCheckLogs(a.db, 200)
}

// ====== 工具函数 ======

func placeholders(ids []int) string {
	out := make([]string, len(ids))
	for i := range ids {
		out[i] = "?"
	}
	return strings.Join(out, ",")
}
func toArgs(ids []int) []interface{} {
	out := make([]interface{}, len(ids))
	for i, v := range ids {
		out[i] = v
	}
	return out
}
