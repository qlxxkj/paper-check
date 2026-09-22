import React, { useState, useEffect, useRef } from 'react';
import ContextView from './ContextViewer';

interface CompareViewProps {
    docId: number;
    docName: string;
    onClose: () => void;
}


const CompareView: React.FC<CompareViewProps> = ({ docId, docName, onClose }) => {
    const [relations, setRelations] = useState<any[]>([]);
    const [selectedDoc, setSelectedDoc] = useState<any>(null);
    const [diffResults, setDiffResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const leftScrollRef = useRef<HTMLDivElement>(null);
    const rightScrollRef = useRef<HTMLDivElement>(null);
    const [repeatRate, setRepeatRate] = useState(0);
    const [repeatParaCount, setRepeatParaCount] = useState(0);

    const [contextView, setContextView] = useState<{
        docId: number;
        paraIndex: number;
    } | null>(null);
    const [contextData, setContextData] = useState<any[]>([]);
    const [contextSize, setContextSize] = useState(3);


    useEffect(() => {
        loadRelations();
        loadContextConfig();
    }, []);

    const loadContextConfig = async () => {
        try {
            const cfg = await window.electronAPI.getConfig();
            if (cfg && cfg.contextSize) {
                setContextSize(cfg.contextSize);
            }
        } catch (_) { /* use default */ }
    };

    // 当 repeatRate 计算完成后，同步更新选中源文档的 pairRepeatRate
    useEffect(() => {
        if (selectedDoc && repeatRate >= 0) {
            setRelations(prev => prev.map((r: any) =>
                r.DocID === selectedDoc.DocID ? { ...r, pairRepeatRate: repeatRate } : r
            ));
        }
    }, [repeatRate, selectedDoc?.DocID]);

    const loadRelations = async () => {
        setLoading(true);
        try {
            const data = await window.electronAPI.getRepeatRelations(docId);
            setRelations(data);
            if (data.length > 0) {
                setSelectedDoc(data[0]);
                await loadDiff(data[0].DocID);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadDiff = async (targetDocId: number) => {
        setLoading(true);
        try {
            const data = await window.electronAPI.getDuplicateParagraphs(docId, targetDocId);
            setDiffResults(data || []);
            if (data && data.length > 0) {
                let totalRepeatChars = 0;
                let totalChars = 0;
                for (const r of data) {
                    const repeatChars = r.highlights
                        .filter((h: any) => h.isHighlight)
                        .reduce((sum: number, h: any) => sum + h.text.length, 0);
                    totalRepeatChars += repeatChars;
                    totalChars += r.doc1ParaText.length;
                }
                const rate = totalChars > 0 ? totalRepeatChars / totalChars : 0;
                setRepeatRate(rate);
                setRepeatParaCount(data.length);
                // 更新选中源文档的 pairRepeatRate（useEffect 会同步到 relations 和 selectedDoc）
                if (selectedDoc) {
                    setSelectedDoc((prev: any) => prev ? { ...prev, pairRepeatRate: rate } : null);
                }
            } else {
                setRepeatRate(0);
                setRepeatParaCount(0);
                if (selectedDoc) {
                    setSelectedDoc((prev: any) => prev ? { ...prev, pairRepeatRate: 0 } : null);
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectDoc = async (targetDoc: any) => {
        setSelectedDoc(targetDoc);
        await loadDiff(targetDoc.DocID);
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>, source: 'left' | 'right') => {
        const target = source === 'left' ? rightScrollRef.current : leftScrollRef.current;
        if (target) {
            target.scrollTop = e.currentTarget.scrollTop;
        }
    };

    // 处理查看上下文的函数
    const handleShowContext = async (docId: number, paraIndex: number) => {
        try {
            console.log('[CompareView] 请求上下文:', { docId, paraIndex, contextSize });
            const context = await window.electronAPI.getParagraphContext(docId, paraIndex, contextSize);
            console.log('[CompareView] 返回上下文:', context);
            if (context.length === 0) {
                console.warn('[CompareView] 上下文为空，请检查 Paragraph 表是否有该文档的段落数据。');
                // 尝试获取该文档的所有段落作为降级方案
                const allParas = await window.electronAPI.getDocParagraphs(docId);
                console.log('[CompareView] 该文档总段落数:', allParas.length);
                if (allParas.length > 0) {
                    // 如果总段落数大于0，但上下文为空，说明 paraIndex 可能超出范围，显示前后段落
                    const total = allParas.length;
                    const start = Math.max(0, paraIndex - contextSize - 1);
                    const end = Math.min(total, paraIndex + contextSize);
                    const fallback = allParas.slice(start, end);
                    setContextData(fallback);
                    setContextView({ docId, paraIndex });
                    return;
                }
            }
            setContextData(context);
            setContextView({ docId, paraIndex });
        } catch (err) {
            console.error('[CompareView] 上下文获取失败:', err);
            alert('获取上下文失败，请查看控制台');
        }
    };

    // 安全获取点击的文档ID和段落索引
    const getClickInfo = (side: 'doc1' | 'doc2', r: any) => {
        if (side === 'doc1') {
            return {
                docId: r.DocID1 ?? r.docId1,
                paraIdx: r.paraIndex1 ?? r.ParaIndex1,
            };
        } else {
            return {
                docId: r.DocID2 ?? r.docId2,
                paraIdx: r.paraIndex2 ?? r.ParaIndex2,
            };
        }
    };

    const renderDocWithDiff = (diffResults: any[], side: 'doc1' | 'doc2') => {

        if (!diffResults || diffResults.length === 0) {
            return <div style={{ padding: 20, color: '#888' }}>没有重复段落</div>;
        }

        return diffResults.map((r, idx) => {
            const paraText = side === 'doc1' ? r.doc1ParaText : r.doc2ParaText;
            const paraIndex = side === 'doc1' ? r.paraIndex1 : r.paraIndex2;
            let highlights = r.highlights || [];

            if (highlights.length === 0 && paraText) {
                highlights = [{ text: paraText, isHighlight: true }];
            }

            // 过滤 diff 段：左侧(doc1)去掉 added(仅属于doc2的文本)，右侧(doc2)去掉 removed(仅属于doc1的文本)
            // diffChars 返回的是合并差异数组，必须按方向过滤才能还原各自原文
            const filteredHighlights = highlights.filter((seg: any) => {
                if (side === 'doc1') return !seg.added;
                if (side === 'doc2') return !seg.removed;
                return true;
            });

            return (
                <div
                    key={`${side}-${r.paraIndex1}-${r.paraIndex2}-${idx}`}
                    style={{
                        marginBottom: 8,
                        padding: '4px 10px',
                        borderBottom: '1px solid #edf2f7',
                        backgroundColor: '#fafafa',
                        borderRadius: 4,
                    }}
                >
                    <div style={{ fontSize: 12, color: '#555', marginBottom: 2, fontWeight: 600 }}>
                        段落 {paraIndex}
                    </div>
                    <div style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {filteredHighlights.map((seg: any, segIdx: number) => {
                            const isHighlight = seg.isHighlight;
                            return (
                                <span
                                    key={segIdx}
                                    style={{
                                        backgroundColor: isHighlight ? '#ffcccc' : 'transparent',
                                        fontWeight: isHighlight ? 'bold' : 'normal',
                                        color: isHighlight ? '#c53030' : 'inherit',
                                        cursor: isHighlight ? 'pointer' : 'default',
                                    }}
                                    onClick={
                                        isHighlight
                                            ? () => {
                                                const info = getClickInfo(side, r);
                                                console.log('[CompareView] 点击高亮:', info, { side });
                                                handleShowContext(info.docId, info.paraIdx);
                                            }
                                            : undefined
                                    }
                                >
                                    {seg.text}
                                </span>
                            );
                        })}
                    </div>
                </div>
            );
        });
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                zIndex: 1000,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
            }}
        >
            <div
                style={{
                    backgroundColor: '#fff',
                    borderRadius: 12,
                    padding: 16,
                    width: '95%',
                    maxWidth: 1400,
                    height: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                }}
            >
                {/* 顶部：左侧文件名，右侧关闭按钮 */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexShrink: 0,
                        paddingBottom: 12,
                        borderBottom: '1px solid #e2e8f0',
                    }}
                >
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#2d3748' }}>
                        <i className="fa-regular fa-file-lines"></i> 查看详情
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '4px 16px',
                            borderRadius: 6,
                            border: 'none',
                            backgroundColor: '#c53030',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: 14,
                        }}
                    >
                        关闭
                    </button>
                </div>

                {/* 文档选择器（多重复源） */}
                {relations.length > 1 && (
                    <div style={{ marginTop: 10, marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                        <span style={{ fontWeight: 500, marginRight: 8 }}>选择对比文档:</span>
                        {relations.map((rel) => (
                            <button
                                key={rel.DocID}
                                onClick={() => handleSelectDoc(rel)}
                                style={{
                                    padding: '4px 12px',
                                    borderRadius: 4,
                                    border: selectedDoc?.DocID === rel.DocID ? '2px solid #2b6cb0' : '1px solid #e2e8f0',
                                    backgroundColor: selectedDoc?.DocID === rel.DocID ? '#ebf8ff' : '#fff',
                                    cursor: 'pointer',
                                    fontSize: 13,
                                }}
                            >
                                {rel.FileName} ({(rel.pairRepeatRate * 100).toFixed(1)}%)
                            </button>
                        ))}
                    </div>
                )}

                {/* 内容区域：左右分栏，各自顶部显示文件名，内容可滚动 */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>加载中...</div>
                ) : diffResults.length > 0 ? (
                    <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 16, marginTop: 8 }}>
                        {/* 左侧 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#2d3748', paddingBottom: 4, flexShrink: 0 }}>
                                当前文档：{docName}
                            </div>
                            <div
                                ref={leftScrollRef}
                                onScroll={(e) => handleScroll(e, 'left')}
                                style={{
                                    flex: 1,
                                    overflow: 'auto',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 8,
                                    padding: 8,
                                    backgroundColor: '#f9fafb',
                                }}
                            >
                                {renderDocWithDiff(diffResults, 'doc1')}
                            </div>
                        </div>

                        {/* 右侧 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#2d3748', paddingBottom: 4, flexShrink: 0 }}>
                                对比文档：{selectedDoc?.FileName || '对比文档'}
                            </div>
                            <div
                                ref={rightScrollRef}
                                onScroll={(e) => handleScroll(e, 'right')}
                                style={{
                                    flex: 1,
                                    overflow: 'auto',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 8,
                                    padding: 8,
                                    backgroundColor: '#f9fafb',
                                }}
                            >
                                {renderDocWithDiff(diffResults, 'doc2')}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>
                        {relations.length === 0 ? '该文档没有重复内容' : '该文档与选中的源文档没有可显示的重复段落'}
                    </div>
                )}

                {/* 底部：左侧提示，右侧统计信息 */}
                <div
                    style={{
                        flexShrink: 0,
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 13,
                        color: '#4a5568',
                    }}
                >
                    <div>
                        <i className="fa-solid fa-lightbulb" style={{color: '#e53e3e'}}></i> 提示: 红色高亮部分为重复文本，左右滚动同步
                    </div>
                    <div style={{ display: 'flex', gap: 24 }}>
                        <div>
                            <strong>重复率：</strong>
                            <span style={{ color: '#e53e3e', fontWeight: 600 }}>
                                {(repeatRate * 100).toFixed(1)}%
                            </span>
                        </div>
                        <div>
                            <strong>重复段落：</strong>
                            <span>{repeatParaCount} 段</span>
                        </div>
                    </div>
                </div>
            </div>
            {contextView && (
                <ContextView
                    docId={contextView.docId}
                    paraIndex={contextView.paraIndex}
                    context={contextData}
                    onClose={() => setContextView(null)}
                />
            )}
        </div>
    );
};

export default CompareView;