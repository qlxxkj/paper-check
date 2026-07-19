import React, { useState, useEffect, useMemo } from 'react';
import CompareView from './components/CompareView';


const globalStyles = `
  *::-webkit-scrollbar { display: none; }
  * { scrollbar-width: none; -ms-overflow-style: none; }
`;

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: 'Segoe UI, Roboto, sans-serif',
        backgroundColor: '#f5f7fa',
        padding: '16px 24px',
        boxSizing: 'border-box',
        overflowY: 'auto',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        flexShrink: 0,
    },
    title: { fontSize: 24, fontWeight: 600, color: '#1a2a3a', margin: 0 },
    statsAndFilter: {
        backgroundColor: '#ffffff',
        borderRadius: 8,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        padding: '12px 16px',
        marginBottom: 16,
        flexShrink: 0,
    },
    statsRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 20,
        marginBottom: 12,
        borderBottom: '1px solid #edf2f7',
        paddingBottom: 10,
        justifyContent: 'center',
    },
    statButton: {
        background: 'none',
        border: 'none',
        fontSize: 14,
        cursor: 'pointer',
        padding: '2px 6px',
        borderRadius: 4,
        transition: 'all 0.2s',
        color: '#2d3748',
        fontWeight: 500,
    },
    statButtonActive: {
        backgroundColor: '#ebf8ff',
        color: '#2b6cb0',
        fontWeight: 600,
    },
    filterBar: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        justifyContent: 'space-between',
    },
    filterLeft: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    filterCenter: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    filterRight: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    filterLabel: { fontSize: 13, fontWeight: 500, color: '#2d3748' },
    filterInput: {
        padding: '4px 8px',
        border: '1px solid #e2e8f0',
        borderRadius: 4,
        fontSize: 13,
        outline: 'none',
    },
    button: {
        padding: '5px 12px',
        borderRadius: 6,
        border: 'none',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s',
        color: '#fff',
        whiteSpace: 'nowrap',
    },
    btnPrimary: { backgroundColor: '#2b6cb0' },
    btnSuccess: { backgroundColor: '#2b8c4e' },
    btnWarning: { backgroundColor: '#d69e2e' },
    btnDanger: { backgroundColor: '#c53030' },
    btnSecondary: { backgroundColor: '#718096' },
    btnInfo: { backgroundColor: '#00a3c4' },
    progressBox: {
        backgroundColor: '#edf2f7',
        padding: '6px 14px',
        borderRadius: 6,
        marginBottom: 12,
        fontSize: 13,
        color: '#2d3748',
        borderLeft: '4px solid #3182ce',
        flexShrink: 0,
    },
    tableWrapper: {
        backgroundColor: '#fff',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        overflowX: 'auto',
        flexShrink: 0,
    },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 },
    th: {
        textAlign: 'left',
        padding: '10px 12px',
        backgroundColor: '#f7fafc',
        color: '#2d3748',
        fontWeight: 600,
        borderBottom: '2px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 10,
    },
    td: { padding: '8px 12px', borderBottom: '1px solid #edf2f7' },
    statusBadge: { display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#fff' },
    statusGreen: { backgroundColor: '#38a169' },
    statusOrange: { backgroundColor: '#dd6b20' },
    statusRed: { backgroundColor: '#e53e3e' },
    statusDefault: { backgroundColor: '#a0aec0' },
    rowGreen: { backgroundColor: '#f0fff4' },
    rowOrange: { backgroundColor: '#fffbeb' },
    rowRed: { backgroundColor: '#fff5f5' },
    rowDefault: { backgroundColor: '#fff' },
    checkbox: { width: 16, height: 16, cursor: 'pointer' },
    actionButton: {
        background: 'none',
        border: '1px solid #e2e8f0',
        borderRadius: 4,
        padding: '2px 8px',
        marginRight: 4,
        cursor: 'pointer',
        fontSize: 12,
        transition: 'all 0.1s',
    },
    pagination: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
        padding: '8px 14px',
        backgroundColor: '#fff',
        borderRadius: 8,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        flexWrap: 'wrap',
        gap: 8,
        flexShrink: 0,
    },
    pageInfo: { fontSize: 13, color: '#4a5568' },
    pageButtons: { display: 'flex', gap: 4, alignItems: 'center' },
    pageButton: { padding: '2px 8px', border: '1px solid #e2e8f0', borderRadius: 4, backgroundColor: '#fff', cursor: 'pointer', fontSize: 13 },
    pageInput: { width: 36, padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: 4, textAlign: 'center' },
    pageSizeSelect: { padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13 },
};

declare global {
    interface Window { electronAPI: any; }
}

function exportToCSV(data: any[], filename: string) {
    // 保留但不再直接使用，因为导出合并了
}

const App: React.FC = () => {
    const [allDocs, setAllDocs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState<any>(null);
    const [compareView, setCompareView] = useState<{ docId: number; docName: string } | null>(null);

    const [keyword, setKeyword] = useState('');
    const [importDate, setImportDate] = useState('');
    const [filterStatus, setFilterStatus] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        loadDocs();
        window.electronAPI.onImportProgress((data: any) => {
            setProgress(data);
            if (data.type === 'done')
                setTimeout(() => setProgress(null), 3000);
        });
    }, []);

    const loadDocs = async () => {
        try {
            const list = await window.electronAPI.getAllDocs();
            setAllDocs(list);
            setCurrentPage(1);
            setSelectedIds(new Set());
        } catch (err) { console.error(err); }
    };

    // ========== 导入 ==========
    const handleImport = async () => {
        const result = await window.electronAPI.openFileDialog({
            properties: ['openFile', 'multiSelections'],
        });
        if (result.canceled || result.filePaths.length === 0) return;
        setLoading(true);
        try {
            await window.electronAPI.importFiles(result.filePaths);
            await loadDocs();
        } finally { setLoading(false); }
    };

    // ========== 批量导入（文件或文件夹） ==========
    const handleBatchImport = async () => {
        const result = await window.electronAPI.openFileDialog({
            properties: ['openFile', 'multiSelections', 'openDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0) return;
        setLoading(true);
        try {
            await window.electronAPI.importMixed(result.filePaths);
            await loadDocs();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            alert('导入失败：' + msg);
        } finally {
            setLoading(false);
        }
    };

    // ========== 备份 ==========
    const handleBackup = async () => {
        await window.electronAPI.backupDB();
        alert('备份完成');
    };

    // ========== 入库 ==========
    const handleMarkSource = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) {
            alert('请至少选择一个文档');
            return;
        }
        const result = await window.electronAPI.batchMarkSource(ids);
        if (result.success) {
            await loadDocs();
            alert('入库成功');
        } else {
            alert('入库失败：' + result.error);
        }
    };

    // ========== 批量删除 ==========
    const handleBatchDelete = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) {
            alert('请至少选择一个文档');
            return;
        }
        if (!confirm(`确定要删除选中的 ${ids.length} 个文档吗？此操作不可恢复！`)) return;
        const result = await window.electronAPI.batchDelete(ids);
        alert(`删除完成：成功 ${result.successCount}，失败 ${result.failCount}`);
        await loadDocs();
    };

    // ========== 导出（合并） ==========
    const handleExport = async () => {
        let ids: number[] = [];
        // 优先使用选中项（跨页选中）
        if (selectedIds.size > 0) {
            ids = Array.from(selectedIds);
        } else {
            // 否则导出当前页的源文档
            ids = currentDocs.filter(d => d.IsSource === 1).map(d => d.DocID);
        }
        if (ids.length === 0) {
            alert('没有可导出的源文档');
            return;
        }
        try {
            const result = await window.electronAPI.exportDataZip(ids);
            if (result.success) {
                alert(`导出成功，保存至：${result.path}`);
            } else if (result.canceled) {
                // 用户取消保存
            } else {
                alert('导出失败，请查看控制台');
            }
        } catch (err) {
            console.error(err);
            alert('导出失败，请查看控制台');
        }
    };

    // ========== 单行操作 ==========
    const handleView = (doc: any) => {
        setCompareView({ docId: doc.DocID, docName: doc.FileName });
    };

    const handleEdit = async (doc: any) => {
        if (!doc.FilePath) return;
        const result = await window.electronAPI.openDoc(doc.FilePath);
        if (!result.success) alert('打开文件失败');
    };

    const handleDeleteRow = async (docId: number) => {
        if (!confirm('确定要删除该文档吗？')) return;
        await window.electronAPI.deleteDoc(docId);
        await loadDocs();
    };

    // ========== 统计与筛选 ==========
    const totalCount = allDocs.length;
    const statusCounts = useMemo(() => {
        const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
        allDocs.forEach(d => {
            const s = d.RepeatStatus as 0 | 1 | 2;
            if (s in counts) counts[s] = (counts[s] || 0) + 1;
        });
        return counts;
    }, [allDocs]);

    const filteredDocs = useMemo(() => {
        return allDocs.filter(doc => {
            if (filterStatus !== null && doc.RepeatStatus !== filterStatus) return false;
            if (keyword && !doc.FileName.toLowerCase().includes(keyword.toLowerCase())) return false;
            if (importDate) {
                const d = new Date(doc.CreateTime).toISOString().slice(0, 10);
                if (d !== importDate) return false;
            }
            return true;
        });
    }, [allDocs, filterStatus, keyword, importDate]);

    const totalItems = filteredDocs.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const currentDocs = filteredDocs.slice(startIndex, startIndex + pageSize);

    const toggleSelectAll = (checked: boolean) => {
        if (checked) {
            const ids = currentDocs.map(d => d.DocID);
            setSelectedIds(new Set(ids));
        } else {
            setSelectedIds(new Set());
        }
    };
    const toggleSelectOne = (docId: number) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(docId)) newSet.delete(docId);
        else newSet.add(docId);
        setSelectedIds(newSet);
    };
    const isAllSelected = currentDocs.length > 0 && currentDocs.every(d => selectedIds.has(d.DocID));

    const getStatusInfo = (status: number) => {
        switch (status) {
            case 0: return { label: '无重复', badgeStyle: styles.statusGreen, rowStyle: styles.rowGreen };
            case 1: return { label: '部分重复', badgeStyle: styles.statusOrange, rowStyle: styles.rowOrange };
            case 2: return { label: '完全重复', badgeStyle: styles.statusRed, rowStyle: styles.rowRed };
            default: return { label: '未知', badgeStyle: styles.statusDefault, rowStyle: styles.rowDefault };
        }
    };

    const renderStatButton = (label: string, count: number, status: number | null) => {
        const isActive = filterStatus === status;
        return (
            <button
                style={{ ...styles.statButton, ...(isActive ? styles.statButtonActive : {}) }}
                onClick={() => setFilterStatus(prev => (prev === status ? null : status))}
            >
                {label}({count})
            </button>
        );
    };

    const resetFilters = () => {
        setKeyword('');
        setImportDate('');
        setFilterStatus(null);
        setCurrentPage(1);
    };

    return (
        <>
            <style>{globalStyles}</style>
            <div style={styles.container}>
                {/* 标题 */}
                <div style={styles.header}>
                    <h1 style={styles.title}>文档管理</h1>
                </div>

                {/* 统计 + 筛选 */}
                <div style={styles.statsAndFilter}>
                    <div style={styles.statsRow}>
                        {renderStatButton('总文件', totalCount, null)}
                        {renderStatButton('无重复', statusCounts[0] || 0, 0)}
                        {renderStatButton('部分重复', statusCounts[1] || 0, 1)}
                        {renderStatButton('完全重复', statusCounts[2] || 0, 2)}
                        <span style={{ ...styles.statButton, cursor: 'default' }}>
                            跳过({progress?.skipped || 0})
                        </span>
                    </div>

                    <div style={styles.filterBar}>
                        <div style={styles.filterLeft}>
                            <span style={styles.filterLabel}>🔍 文件名:</span>
                            <input type="text" placeholder="模糊搜索" value={keyword}
                                onChange={(e) => { setKeyword(e.target.value); setCurrentPage(1); }}
                                style={{ ...styles.filterInput, width: 140 }} />
                            <span style={styles.filterLabel}>📅 导入日期:</span>
                            <input type="date" value={importDate}
                                onChange={(e) => { setImportDate(e.target.value); setCurrentPage(1); }}
                                style={styles.filterInput} />
                            <button style={{ ...styles.button, ...styles.btnPrimary }} onClick={() => setCurrentPage(1)}>查询</button>
                            <button style={{ ...styles.button, ...styles.btnSecondary }} onClick={resetFilters}>重置</button>
                            <button style={{ ...styles.button, ...styles.btnSuccess }} onClick={handleExport}>📦 导出</button>
                        </div>

                        <div style={styles.filterCenter}>
                            <button style={{ ...styles.button, ...styles.btnPrimary }} onClick={handleBatchImport}>
                                📁 批量导入
                            </button>
                            <button style={{ ...styles.button, ...styles.btnInfo }} onClick={handleBackup}>
                                📥 备份
                            </button>
                            <button style={{ ...styles.button, ...styles.btnDanger }} onClick={handleBatchDelete}>
                                🗑️ 批量删除
                            </button>
                        </div>

                        <div style={styles.filterRight}>
                            <button style={{ ...styles.button, ...styles.btnSuccess }} onClick={handleImport}>
                                ➕ 新增
                            </button>
                        </div>
                    </div>
                </div>

                {/* 进度 */}
                {progress && progress.type !== 'done' && (
                    <div style={styles.progressBox}>
                        <strong>处理中:</strong> {progress.file || '...'} ({progress.status || '准备'})
                        <span style={{ marginLeft: 16 }}>
                            成功: {progress.success || 0} | 失败: {progress.failed || 0} | 跳过: {progress.skipped || 0}
                        </span>
                    </div>
                )}

                {/* 表格 */}
                <div style={styles.tableWrapper}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}><input type="checkbox" checked={isAllSelected} onChange={(e) => toggleSelectAll(e.target.checked)} style={styles.checkbox} /></th>
                                <th style={styles.th}>序号</th>
                                <th style={styles.th}>文件名</th>
                                <th style={styles.th}>段落数</th>
                                <th style={styles.th}>总字数</th>
                                <th style={styles.th}>重复率</th>
                                <th style={styles.th}>状态</th>
                                <th style={styles.th}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentDocs.length === 0 ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px 0', color: '#888' }}>暂无匹配文档</td></tr>
                            ) : (
                                currentDocs.map((doc, idx) => {
                                    const statusInfo = getStatusInfo(doc.RepeatStatus);
                                    const rowNum = startIndex + idx + 1;
                                    return (
                                        <tr key={doc.DocID} style={statusInfo.rowStyle}>
                                            <td style={styles.td}>
                                                <input type="checkbox" checked={selectedIds.has(doc.DocID)} onChange={() => toggleSelectOne(doc.DocID)} style={styles.checkbox} />
                                            </td>
                                            <td style={styles.td}>{rowNum}</td>
                                            <td style={styles.td}>{doc.FileName}</td>
                                            <td style={styles.td}>{doc.ParagraphCount}</td>
                                            <td style={styles.td}>{doc.WordCount}</td>
                                            <td style={styles.td}>{(doc.RepeatRate * 100).toFixed(1)}%</td>
                                            <td style={styles.td}>
                                                <span style={{ ...styles.statusBadge, ...statusInfo.badgeStyle }}>{statusInfo.label}</span>
                                            </td>
                                            <td style={styles.td}>
                                                <button style={styles.actionButton} onClick={() => handleView(doc)}>查看</button>
                                                <button style={styles.actionButton} onClick={() => handleEdit(doc)}>编辑</button>
                                                <button style={{ ...styles.actionButton, color: 'red', borderColor: 'red' }} onClick={() => handleDeleteRow(doc.DocID)}>删除</button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* 分页 */}
                <div style={styles.pagination}>
                    <div style={styles.pageInfo}>
                        共 {totalItems} 条，第 {startIndex + 1} - {Math.min(startIndex + pageSize, totalItems)} 条
                    </div>
                    <div style={styles.pageButtons}>
                        <button style={styles.pageButton} disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>上一页</button>
                        <span>第</span>
                        <input type="number" min={1} max={totalPages} value={currentPage}
                            onChange={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= totalPages) setCurrentPage(v); }}
                            style={styles.pageInput} />
                        <span>/ {totalPages} 页</span>
                        <button style={styles.pageButton} disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>下一页</button>
                        <span style={{ marginLeft: 12 }}>每页</span>
                        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }} style={styles.pageSizeSelect}>
                            <option value={10}>10</option>
                            <option value={30}>30</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                        <span>条</span>
                    </div>
                </div>

                {compareView && (
                    <CompareView
                        docId={compareView.docId}
                        docName={compareView.docName}
                        onClose={() => setCompareView(null)}
                    />
                )}
            </div>
        </>
    );
};

export default App;