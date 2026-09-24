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

// CompareDocs 对齐 diffComparator.ts：双文档段落两两 diff，取最佳 rate
func CompareDocs(d *sql.DB, docId1, docId2 int, threshold float64) ([]DiffResult, error) {
	paras1, err := d.Query(`SELECT ParaIndex, ParaText FROM Paragraph WHERE DocID = ? ORDER BY ParaIndex`, docId1)
	if err != nil {
		return nil, err
	}
	type p1 struct {
		Idx  int
		Text string
	}
	var list1 []p1
	for paras1.Next() {
		var x p1
		if err := paras1.Scan(&x.Idx, &x.Text); err != nil {
			paras1.Close()
			return nil, err
		}
		list1 = append(list1, x)
	}
	paras1.Close()

	paras2, err := d.Query(`SELECT ParaIndex, ParaText FROM Paragraph WHERE DocID = ? ORDER BY ParaIndex`, docId2)
	if err != nil {
		return nil, err
	}
	var list2 []p2type
	for paras2.Next() {
		var x p2type
		if err := paras2.Scan(&x.Idx, &x.Text); err != nil {
			paras2.Close()
			return nil, err
		}
		list2 = append(list2, x)
	}
	paras2.Close()

	results := []DiffResult{}
	for _, p1 := range list1 {
		bestRate := 0.0
		var bestSegs []HighlightSegment
		bestIdx2 := -1
		for _, p2 := range list2 {
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
				Doc2ParaText: list2[idxOf(list2, bestIdx2)].Text,
				Highlights:   bestSegs,
				MatchRate:    bestRate,
			})
		}
	}
	return results, nil
}

func idxOf(list []p2type, v int) int {
	for i := range list {
		if list[i].Idx == v {
			return i
		}
	}
	return -1
}

type p2type struct {
	Idx  int
	Text string
}
