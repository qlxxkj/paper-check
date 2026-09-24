package dedup

import (
	"crypto/sha256"
	"encoding/hex"
	"database/sql"
)

// HashText 对齐 src/main/dedup/hashComparator.ts：SHA-256 hex。
// 与原 TS 实现字节级一致，数据库里存的 ParaHash / FullTextHash 老数据完全兼容。
func HashText(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

// BuildNGramIndex 对齐 ngramIndex.ts：为文档段落生成 N-gram 指纹入倒排表
func BuildNGramIndex(d *sql.DB, docId int, paragraphs []string, n int) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	ins, err := tx.Prepare(`INSERT INTO NGramIndex (ngram, DocID, ParaIndex) VALUES (?, ?, ?)`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer ins.Close()
	for idx, text := range paragraphs {
		clean := removeWhitespace(text)
		for i := 0; i <= len(clean)-n; i++ {
			ngram := clean[i : i+n]
			if _, err := ins.Exec(ngram, docId, idx+1); err != nil {
				tx.Rollback()
				return err
			}
		}
	}
	return tx.Commit()
}

// FindCandidates 对齐 ngramIndex.ts：粗筛可能相似的候选文档 ID
func FindCandidates(d *sql.DB, docId int, paragraphs []string, n int) ([]int, error) {
	allNgrams := map[string]struct{}{}
	for _, para := range paragraphs {
		clean := removeWhitespace(para)
		for i := 0; i <= len(clean)-n; i++ {
			allNgrams[clean[i:i+n]] = struct{}{}
		}
	}
	if len(allNgrams) == 0 {
		return nil, nil
	}
	// 用集合逐个查，避免超长 IN 子句
	var candidates []int
	seen := map[int]struct{}{}
	for ngram := range allNgrams {
		rows, err := d.Query(`SELECT DISTINCT DocID FROM NGramIndex WHERE ngram = ? AND DocID != ?`, ngram, docId)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id int
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return nil, err
			}
			if _, ok := seen[id]; !ok {
				seen[id] = struct{}{}
				candidates = append(candidates, id)
			}
		}
		rows.Close()
	}
	return candidates, nil
}

// CheckDuplicate 对齐 hashComparator.ts 的 checkDuplicate：全文哈希 + 段落哈希查重
func CheckDuplicate(d *sql.DB, docId int, paragraphs []string, fullTextHash string) (CheckResult, error) {
	var full struct{ DocID int }
	err := d.QueryRow(`SELECT DocID FROM Document WHERE FullTextHash = ? AND IsSource = 1 AND DocID != ?`, fullTextHash, docId).Scan(&full.DocID)
	if err == nil {
		indices := make([]int, len(paragraphs))
		for i := range indices {
			indices[i] = i
		}
		return CheckResult{
			IsFullDuplicate:    true,
			RepeatRate:         1.0,
			RepeatParaCount:    len(paragraphs),
			RepeatParaIndices:  indices,
			MatchedDocIds:      []int{full.DocID},
		}, nil
	}

	hashes := make([]string, len(paragraphs))
	for i, p := range paragraphs {
		hashes[i] = HashText(p)
	}
	if len(hashes) == 0 {
		return CheckResult{MatchedDocIds: []int{}}, nil
	}
	// 收集匹配的段落哈希 → 哪些 DocID
	hashSet := map[string]struct{}{}
	placeholders := make([]string, len(hashes))
	args := make([]interface{}, len(hashes))
	for i, h := range hashes {
		placeholders[i] = "?"
		args[i] = h
	}
	args = append(args, docId)
	stmt := `SELECT ParaHash, DocID FROM ParaHashIndex WHERE ParaHash IN (` + joinComma(placeholders) + `) AND DocID != ?`
	rows, err := d.Query(stmt, args...)
	if err != nil {
		return CheckResult{}, err
	}
	defer rows.Close()
	matchDocs := map[string][]int{}
	var matched []string
	for rows.Next() {
		var ph string
		var did int
		if err := rows.Scan(&ph, &did); err != nil {
			return CheckResult{}, err
		}
		hashSet[ph] = struct{}{}
		matchDocs[ph] = append(matchDocs[ph], did)
		matched = append(matched, ph)
	}
	_ = matched

	repeatParaIndices := []int{}
	mergedMatched := map[int]struct{}{}
	for i, h := range hashes {
		if _, ok := hashSet[h]; ok {
			repeatParaIndices = append(repeatParaIndices, i)
			for _, did := range matchDocs[h] {
				mergedMatched[did] = struct{}{}
			}
		}
	}
	totalLen := 0
	for _, p := range paragraphs {
		totalLen += len(p)
	}
	repeatLen := 0
	for _, idx := range repeatParaIndices {
		repeatLen += len(paragraphs[idx])
	}
	rate := 0.0
	if totalLen > 0 {
		rate = float64(repeatLen) / float64(totalLen)
	}
	uniqMatched := make([]int, 0, len(mergedMatched))
	for id := range mergedMatched {
		uniqMatched = append(uniqMatched, id)
	}
	return CheckResult{
		IsFullDuplicate:   false,
		RepeatRate:        rate,
		RepeatParaCount:   len(repeatParaIndices),
		RepeatParaIndices: repeatParaIndices,
		MatchedDocIds:     uniqMatched,
	}, nil
}

type CheckResult struct {
	IsFullDuplicate   bool
	RepeatRate        float64
	RepeatParaCount   int
	RepeatParaIndices []int
	MatchedDocIds     []int
}

func joinComma(items []string) string {
	out := ""
	for i, s := range items {
		if i > 0 {
			out += ","
		}
		out += s
	}
	return out
}

// removeWhitespace 去空白（含 Unicode 空白，与 db 包一致）
func removeWhitespace(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		switch r {
		case ' ', '\t', '\n', '\r', '\v', '\f', 0x85, 0xA0,
			0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
			0x2008, 0x2009, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F:
			continue
		default:
			out = append(out, r)
		}
	}
	return string(out)
}
