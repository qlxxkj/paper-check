import React, { useState, useEffect, useRef } from 'react';

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

    useEffect(() => {
        loadRelations();
    }, []);

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
                setRepeatRate(totalChars > 0 ? totalRepeatChars / totalChars : 0);
                setRepeatParaCount(data.length);
            } else {
                setRepeatRate(0);
                setRepeatParaCount(0);
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

            // 如果高亮比例超过20%，整段高亮
            const totalChars = paraText.length;
            const highlightChars = highlights
                .filter((h: any) => h.isHighlight)
                .reduce((sum: number, h: any) => sum + h.text.length, 0);
            const highlightRatio = totalChars > 0 ? highlightChars / totalChars : 0;
            if (highlightRatio > 0.2 && totalChars > 0) {
                highlights = [{ text: paraText, isHighlight: true }];
            }
            // 如果 highights 为空（理论上不会），整段显示但不标红
            // if (highlights.length === 0) {
            //     return (
            //         <div
            //             key={`${side}-${r.paraIndex1}-${r.paraIndex2}-${idx}`}
            //             style={{
            //                 marginBottom: 8,
            //                 padding: '4px 10px',
            //                 borderBottom: '1px solid #edf2f7',
            //                 backgroundColor: '#fafafa',
            //                 borderRadius: 4,
            //             }}
            //         >
            //             <div style={{ fontSize: 12, color: '#555', marginBottom: 2, fontWeight: 600 }}>段落 {paraIndex}</div>
            //             <div style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{paraText}</div>
            //         </div>
            //     );
            // }


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
                        {highlights.map((seg: any, segIdx: number) => (
                            <span
                                key={segIdx}
                                style={{
                                    backgroundColor: seg.isHighlight ? '#ffcccc' : 'transparent',
                                    fontWeight: seg.isHighlight ? 'bold' : 'normal',
                                    color: seg.isHighlight ? '#c53030' : 'inherit',
                                }}
                            >
                                {seg.text}
                            </span>
                        ))}
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
                        {/* 📄 {docName} */}📄 查看详情
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
                        💡 提示: 红色高亮部分为重复文本，左右滚动同步
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
        </div>
    );
};

export default CompareView;