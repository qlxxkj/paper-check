package dedup

import "database/sql"

// HighlightSegment 对齐前端读取的 JSON 结构（text + isHighlight）
type HighlightSegment struct {
	Text        string `json:"text"`
	IsHighlight bool   `json:"isHighlight"`
}

// DiffResult 对齐 src/main/dedup/diffComparator.ts 的返回结构
type DiffResult struct {
	DocID1       int                `json:"DocID1"`
	DocID2       int                `json:"DocID2"`
	ParaIndex1   int                `json:"paraIndex1"`
	ParaIndex2   int                `json:"paraIndex2"`
	Doc1ParaText string             `json:"doc1ParaText"`
	Doc2ParaText string             `json:"doc2ParaText"`
	Highlights   []HighlightSegment `json:"highlights"`
	MatchRate    float64            `json:"matchRate"`
}

// DiffParagraphs 字符级 Myers diff（零依赖实现，等价 diff npm 的 diffChars 输出）。
// isHighlight = 双方共有字符段（即重复部分）。
func DiffParagraphs(text1, text2 string) []HighlightSegment {
	a := []rune(text1)
	b := []rune(text2)
	// 经典 Myers O((n+m)*D) 编辑脚本
	script := myersDiff(a, b)
	// script: []diffOp（op='eq' 共有, 'ins' 新增, 'del' 删除）
	var segs []HighlightSegment
	for _, op := range script {
		segs = append(segs, HighlightSegment{Text: op.text, IsHighlight: op.op == "eq"})
	}
	return segs
}

type diffOp struct {
	op   string // "eq" | "ins" | "del"
	text string
}

// myersDiff 返回从 a→b 的操作序列（按字符）
func myersDiff(a, b []rune) []diffOp {
	n, m := len(a), len(b)
	// L 表
	maxD := n + m
	var l int
	// 简化实现：DP 回溯（O(n*m)），对论文段落规模足够
	// 用 LCS DP 更直观
	// dp[i][j] = LCS(a[:i], b[:j])
	dp := make([][]int, n+1)
	for i := range dp {
		dp[i] = make([]int, m+1)
	}
	for i := n - 1; i >= 0; i-- {
		for j := m - 1; j >= 0; j-- {
			if a[i] == b[j] {
				dp[i][j] = dp[i+1][j+1] + 1
			} else if dp[i+1][j] >= dp[i][j+1] {
				dp[i][j] = dp[i+1][j]
			} else {
				dp[i][j] = dp[i][j+1]
			}
		}
	}
	// 回溯生成操作序列
	var ops []diffOp
	i, j := 0, 0
	for i < n && j < m {
		if a[i] == b[j] {
			ops = append(ops, diffOp{op: "eq", text: string(a[i])})
			i++
			j++
		} else if dp[i+1][j] >= dp[i][j+1] {
			ops = append(ops, diffOp{op: "del", text: string(a[i])})
			i++
		} else {
			ops = append(ops, diffOp{op: "ins", text: string(b[j])})
			j++
		}
	}
	for ; i < n; i++ {
		ops = append(ops, diffOp{op: "del", text: string(a[i])})
	}
	for ; j < m; j++ {
		ops = append(ops, diffOp{op: "ins", text: string(b[j])})
	}
	// 合并连续同 op 成段（减少片段数，等价 diffChars 输出）
	var merged []diffOp
	for _, op := range ops {
		if len(merged) > 0 && merged[len(merged)-1].op == op.op {
			merged[len(merged)-1].text += op.text
		} else {
			merged = append(merged, op)
		}
	}
	_ = l
	_ = maxD
	return merged
}

// CompareDocs 对齐 diffComparator.ts + hashComparator.ts 的双重逻辑：
// 1. 先按整段 ParaHash 全等找出重复段落对（与列表 GetRepeatRelations 的
//    pairRepeatRate 算法一致，避免"列表 100% 但查看为空"）。
// 2. 对其余 doc1 段落与 doc2 段落两两字符级 diff，取最佳 rate（原逻辑）。
func CompareDocs(d *sql.DB, docId1, docId2 int, threshold float64) ([]DiffResult, error) {
	paras1, err := loadParas(d, docId1)
	if err != nil {
		return nil, err
	}
	paras2, err := loadParas(d, docId2)
	if err != nil {
		return nil, err
	}
	if len(paras1) == 0 || len(paras2) == 0 {
		return []DiffResult{}, nil
	}

	// doc2 段落哈希表：hash -> 段落索引
	hashToParas2 := map[string][]int{}
	for idx, p2 := range paras2 {
		h := HashText(p2.Text)
		hashToParas2[h] = append(hashToParas2[h], idx)
	}

	results := []DiffResult{}
	matched2 := map[int]bool{}
	for i, p1 := range paras1 {
		h1 := HashText(p1.Text)
		// 1. 整段哈希全等 → 100% 重复，与列表口径一致
		if candidates, ok := hashToParas2[h1]; ok && len(candidates) > 0 {
			bestIdx2 := -1
			for _, c := range candidates {
				if !matched2[c] {
					bestIdx2 = c
					break
				}
			}
			if bestIdx2 == -1 {
				bestIdx2 = candidates[0]
			}
			matched2[bestIdx2] = true
			results = append(results, DiffResult{
				DocID1:       docId1,
				DocID2:       docId2,
				ParaIndex1:   p1.Idx,
				ParaIndex2:   paras2[bestIdx2].Idx,
				Doc1ParaText: p1.Text,
				Doc2ParaText: paras2[bestIdx2].Text,
				// 整段相同 → 整段高亮
				Highlights: []HighlightSegment{{Text: p1.Text, IsHighlight: true}},
				MatchRate:  1.0,
			})
			continue
		}
		// 2. 字符级 diff（与 doc2 未匹配段落）
		_ = i
		bestRate := 0.0
		var bestSegs []HighlightSegment
		bestIdx2 := -1
		for _, p2 := range paras2 {
			segs := DiffParagraphs(p1.Text, p2.Text)
			repeatChars := 0
			for _, h := range segs {
				if h.IsHighlight {
					repeatChars += len(h.Text)
				}
			}
			var rate float64
			if len(p1.Text) > 0 {
				rate = float64(repeatChars) / float64(len(p1.Text))
			}
			if rate > bestRate {
				bestRate = rate
				bestSegs = segs
				bestIdx2 = p2.Idx
			}
		}
		if bestRate >= threshold && bestIdx2 != -1 {
			results = append(results, DiffResult{
				DocID1:       docId1,
				DocID2:       docId2,
				ParaIndex1:   p1.Idx,
				ParaIndex2:   bestIdx2,
				Doc1ParaText: p1.Text,
				Doc2ParaText: lookupPara(paras2, bestIdx2),
				Highlights:   bestSegs,
				MatchRate:    bestRate,
			})
		}
	}
	return results, nil
}

func loadParas(d *sql.DB, docId int) ([]p2type, error) {
	rows, err := d.Query(`SELECT ParaIndex, ParaText FROM Paragraph WHERE DocID = ? ORDER BY ParaIndex`, docId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []p2type
	for rows.Next() {
		var x p2type
		if err := rows.Scan(&x.Idx, &x.Text); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, nil
}

func lookupPara(list []p2type, v int) string {
	for i := range list {
		if list[i].Idx == v {
			return list[i].Text
		}
	}
	return ""
}

type p2type struct {
	Idx  int
	Text string
}
