package importsvc

import (
	"context"
	"database/sql"
	"strings"
	"sync"
	"time"

	"paper-check/internal/config"
	"paper-check/internal/dedup"
	"paper-check/internal/db"
	"paper-check/internal/parser"
)

// 进度消息结构对齐原 importWorker.ts 的 ProgressMessage（前端监听 import-progress）
type Progress struct {
	Type            string  `json:"type"`
	File            string  `json:"file,omitempty"`
	Status          string  `json:"status,omitempty"`
	Reason          string  `json:"reason,omitempty"`
	Error           string  `json:"error,omitempty"`
	DocID           int     `json:"docId,omitempty"`
	RepeatRate      float64 `json:"repeatRate,omitempty"`
	IsSource        bool    `json:"isSource,omitempty"`
	RepeatParaCount int     `json:"repeatParaCount,omitempty"`
	Index           int     `json:"index,omitempty"`
	Total           int     `json:"total,omitempty"`
	Success         int     `json:"success,omitempty"`
	Failed          int     `json:"failed,omitempty"`
	Skipped         int     `json:"skipped,omitempty"`
}

// ImportResult 汇总
type ImportResult struct {
	Success int `json:"success"`
	Failed  int `json:"failed"`
	Skipped int `json:"skipped"`
}

// ImportService 并发导入服务：goroutine 池替代原 worker_threads（4 并发）
type ImportService struct {
	db       *sql.DB
	config   config.AppConfig
	antiword string
	ctx      context.Context
	workers  int
	emit     func(event string, payload any) // Wails runtime.EventsEmit 注入
}

// New 创建导入服务。emit 由 main 注入（runtime.EventsEmit）。
func New(d *sql.DB, cfg config.AppConfig, antiwordPath string, emit func(string, any)) *ImportService {
	return &ImportService{
		db:       d,
		config:   cfg,
		antiword: antiwordPath,
		workers:  4,
		emit:     emit,
	}
}

// Run 导入一批文件（对齐 importWorker.ts 的 processFiles）。
// 文件切 4 块并发处理，进度通过 emit 推给前端。
func (s *ImportService) Run(ctx context.Context, filePaths []string) ImportResult {
	s.ctx = ctx
	var result ImportResult
	if len(filePaths) == 0 {
		return result
	}

	chunkCount := s.workers
	if chunkCount > len(filePaths) {
		chunkCount = len(filePaths)
	}
	chunkSize := (len(filePaths) + chunkCount - 1) / chunkCount

	var (
		mu   sync.Mutex
		wg   sync.WaitGroup
		totalSuccess, totalFailed, totalSkipped int
	)

	for w := 0; w < chunkCount; w++ {
		start := w * chunkSize
		end := start + chunkSize
		if end > len(filePaths) {
			end = len(filePaths)
		}
		chunk := filePaths[start:end]
		wg.Add(1)
		go func(chunk []string, startIndex int) {
			defer wg.Done()
			workerStats := s.processChunk(chunk, startIndex)
			mu.Lock()
			totalSuccess += workerStats.Success
			totalFailed += workerStats.Failed
			totalSkipped += workerStats.Skipped
			mu.Unlock()
		}(chunk, start)
	}
	wg.Wait()

	result.Success = totalSuccess
	result.Failed = totalFailed
	result.Skipped = totalSkipped
	// 完成事件
	if s.emit != nil {
		s.emit("import-progress", Progress{
			Type: "done", Success: result.Success, Failed: result.Failed, Skipped: result.Skipped,
		})
	}
	return result
}

type workerStats struct {
	Success, Failed, Skipped int
}

// processChunk 处理一批文件（对齐 importWorker.ts 主循环）
func (s *ImportService) processChunk(files []string, startIndex int) workerStats {
	stats := workerStats{}
	ngramLen := s.config.NgramLength
	if ngramLen == 0 {
		ngramLen = 16
	}

	for i, filePath := range files {
		globalIndex := startIndex + i
		outcome, err := s.processOneFile(filePath, ngramLen, globalIndex, len(files))
		if err != nil {
			stats.Failed++
			continue
		}
		if outcome == "skipped" {
			stats.Skipped++
			continue
		}
		stats.Success++
	}
	return stats
}

// processOneFile 处理单个文件。返回 "success" / "skipped"；失败返回 error
func (s *ImportService) processOneFile(filePath string, ngramLen, globalIndex, total int) (string, error) {
	// 1. 解析
	parsed, err := parser.ParseWordFile(filePath, s.antiword)
	if err != nil {
		s.emitProgress(Progress{Type: "progress", File: filePath, Status: "failed", Error: err.Error(),
			Index: globalIndex, Total: total})
		return "", err
	}

	// 2. 引文过滤 + 按空行拆段
	cleanText, excluded := parser.FilterReferences(parsed.FullText)
	paragraphs := splitDoubleNewline(cleanText)
	if len(paragraphs) == 0 {
		s.emitProgress(Progress{Type: "progress", File: filePath, Status: "skipped", Reason: "无有效段落",
			Index: globalIndex, Total: total})
		return "skipped", nil
	}

	fullTextHash := dedup.HashText(cleanText)

	// 3. 插入文档
	doc := db.Document{
		FileName:         parsed.FileName,
		FilePath:         parsed.FilePath,
		FileSize:         parsed.FileSize,
		ParagraphCount:   len(paragraphs),
		WordCount:        len(cleanText),
		FullTextHash:     fullTextHash,
		IsSource:         0,
		RepeatStatus:     0,
		RepeatRate:       0,
		CreateTime:       time.Now().Format(time.RFC3339),
		ExcludedRefWords: excluded,
	}
	docId, err := db.InsertDocument(s.db, doc)
	if err != nil {
		return "", err
	}

	// 4. 插入段落
	paras := make([]db.Paragraph, 0, len(paragraphs))
	for idx, text := range paragraphs {
		paras = append(paras, db.Paragraph{
			DocID:     docId,
			ParaIndex: idx + 1,
			ParaText:  text,
			ParaHash:  dedup.HashText(text),
			Length:    len(text),
		})
	}
	if err := db.InsertParagraphs(s.db, paras); err != nil {
		return "", err
	}

	// 5. 建 N-gram 索引 + 粗筛候选
	if err := dedup.BuildNGramIndex(s.db, docId, paragraphs, ngramLen); err != nil {
		return "", err
	}
	candidates, _ := dedup.FindCandidates(s.db, docId, paragraphs, ngramLen)

	// 6. 精查
	highestRate := 0.0
	bestMatchId := -1
	var bestDiffs []dedup.DiffResult
	for _, candId := range candidates {
		diffs, err := dedup.CompareDocs(s.db, docId, candId, 0.01)
		if err != nil {
			continue
		}
		totalChars := 0
		for _, p := range paragraphs {
			totalChars += len(p)
		}
		repeatChars := 0
		for _, dr := range diffs {
			repeatChars += int(dr.MatchRate * float64(len(dr.Doc1ParaText)))
		}
		rate := 0.0
		if totalChars > 0 {
			rate = float64(repeatChars) / float64(totalChars)
		}
		if rate > highestRate {
			highestRate = rate
			bestMatchId = candId
			bestDiffs = diffs
		}
	}

	// 7. 更新文档状态
	status := 0
	if highestRate >= s.config.FullDuplicateThreshold {
		status = 2
	} else if highestRate > s.config.PartialDuplicateThreshold {
		status = 1
	}
	if err := db.UpdateDocRepeatStatus(s.db, docId, status, highestRate); err != nil {
		return "", err
	}

	// 8. 存 Diff 结果
	if bestMatchId != -1 && len(bestDiffs) > 0 {
		_ = db.StoreDiffResults(s.db, docId, bestMatchId, bestDiffs)
	}

	s.emitProgress(Progress{
		Type: "progress", File: filePath, Status: "success",
		DocID: docId, RepeatRate: highestRate, IsSource: highestRate == 0,
		RepeatParaCount: len(bestDiffs),
		Index: globalIndex, Total: total,
	})

	return "success", nil
}

func (s *ImportService) emitProgress(p Progress) {
	if s.emit != nil {
		s.emit("import-progress", p)
	}
}

// splitDoubleNewline 按空行拆段
func splitDoubleNewline(text string) []string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	parts := strings.Split(text, "\n\n")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		t := strings.TrimSpace(p)
		if t != "" {
			out = append(out, t)
		}
	}
	return out
}
