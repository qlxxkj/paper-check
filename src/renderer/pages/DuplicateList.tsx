// src/renderer/pages/DuplicateList.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Document } from '../../shared/types';
import CompareView from '../components/CompareView';

// ========== 样式（与之前保持一致，新增进度条样式） ==========
const styles: { [key: string]: React.CSSProperties } = {
    container: {
        padding: '16px 24px',
        backgroundColor: '#f5f7fa',
        minHeight: '100%'
    },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    title: { fontSize: 24, fontWeight: 600, color: '#1a2a3a', margin: 0 },
    toolbar: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, justifyContent: 'space-between' },
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
    btnDanger: { backgroundColor: '#c53030' },
    btnSecondary: { backgroundColor: '#718096' },
    progressBox: {
        backgroundColor: '#edf2f7',
        padding: '8px 16px',
        borderRadius: 6,
        marginBottom: 12,
        fontSize: 13,
        color: '#2d3748',
        borderLeft: '4px solid #3182ce',
    },
    tableWrapper: { backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 },
    th: { textAlign: 'left', padding: '10px 12px', backgroundColor: '#f7fafc', color: '#2d3748', fontWeight: 600, borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 },
    td: { padding: '8px 12px', borderBottom: '1px solid #edf2f7' },
    checkbox: { width: 16, height: 16, cursor: 'pointer' },
    actionButton: { background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 8px', marginRight: 4, cursor: 'pointer', fontSize: 12 },
    empty: { textAlign: 'center', padding: '30px 0', color: '#888' },
};

declare global {
    interface Window { electronAPI: any; }
}

const DuplicateList: React.FC = () => {
    const [pendingDocs, setPendingDocs] = useState<Document[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [compareView, setCompareView] = useState<{ docId: number; docName: string } | null>(null);
    const [repeatRelations, setRepeatRelations] = useState<Map<number, any[]>>(new Map());

    // ===== 进度状态 =====
    const [progress, setProgress] = useState<any>(null);
    // 用于正确移除 IPC 监听器
    const removeProgressListenerRef = useRef<(() => void) | null>(null);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ===== 加载待确认文档 =====
    const loadPending = async () => {
        setLoading(true);
        try {
            const all: Document[] = await window.electronAPI.getAllDocs();
            // 显示所有 IsSource=0 的文档（包括无重复的）
            const pending = all.filter((d: Document) => d.IsSource === 0);
            setPendingDocs(pending);
            // 加载每个文档的重复关系
            const relationsMap = new Map<number, any[]>();
            for (const doc of pending) {
                try {
                    const relations = await window.electronAPI.getRepeatRelations(doc.DocID);
                    if (relations.length > 0) {
                        relationsMap.set(doc.DocID, relations);
                    }
                } catch (err) {
                    console.error(`[DuplicateList] 获取关系失败:`, err);
                }
            }
            setRepeatRelations(relationsMap);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // 安全隐藏进度条
    const safeHideProgress = () => {
        if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
        hideTimerRef.current = setTimeout(() => setProgress(null), 3000);
    };

    useEffect(() => {
        loadPending();
        // 监听导入进度
        const progressHandler = (data: any) => {
            setProgress(data);
        };
        // 保存取消函数，确保每次只注册一个监听器
        removeProgressListenerRef.current = window.electronAPI.onImportProgress(progressHandler);
        // 清理：移除监听器 + 清除定时器
        return () => {
            if (removeProgressListenerRef.current) removeProgressListenerRef.current();
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        };
    }, []);

    // ===== 导入功能 =====
    const handleImport = async () => {
        const result = await window.electronAPI.openFileDialog({
            properties: ['openFile', 'multiSelections'],
        });
        if (result.canceled || result.filePaths.length === 0) return;
        // 清除旧的隐藏定时器，显示进度框
        if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
        setProgress({ type: 'start', status: '准备导入...', index: 0, total: result.filePaths.length });
        try {
            await window.electronAPI.importFiles(result.filePaths);
            // invoke 返回说明所有 worker 已完成，DB 写入完毕
            safeHideProgress();
            // 刷新列表
            loadPending();
        } catch (err) {
            console.error(err);
            alert('导入失败：' + (err instanceof Error ? err.message : String(err)));
            setProgress(null);
        }
    };

    const handleBatchImport = async () => {
        const result = await window.electronAPI.openFileDialog({
            properties: ['openFile', 'multiSelections', 'openDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0) return;
        // 清除旧的隐藏定时器，显示进度框
        if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
        setProgress({ type: 'start', status: '准备批量导入...', index: 0, total: result.filePaths.length });
        try {
            await window.electronAPI.importMixed(result.filePaths);
            // invoke 返回说明所有 worker 已完成，DB 写入完毕
            safeHideProgress();
            // 刷新列表
            loadPending();
        } catch (err) {
            console.error(err);
            alert('批量导入失败：' + (err instanceof Error ? err.message : String(err)));
            setProgress(null);
        }
    };

    // ===== 操作 =====
    const handleView = (doc: Document) => {
        setCompareView({ docId: doc.DocID, docName: doc.FileName });
    };

    const handleConfirm = async (docId: number) => {
        if (!confirm('确定要入库吗？入库后将作为源文档参与后续查重。')) return;
        try {
            await window.electronAPI.batchMarkSource([docId]);
            await loadPending();
        } catch (err) {
            console.error(err);
            alert('入库失败');
        }
    };

    const handleDelete = async (docId: number) => {
        if (!confirm('确定删除该文档及其所有数据？此操作不可恢复！')) return;
        try {
            await window.electronAPI.deleteDoc(docId);
            await loadPending();
        } catch (err) {
            console.error(err);
            alert('删除失败');
        }
    };

    // ===== 批量操作 =====
    const toggleSelect = (docId: number) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(docId)) newSet.delete(docId);
        else newSet.add(docId);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(new Set(pendingDocs.map((d: Document) => d.DocID)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleBatchConfirm = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) { alert('请至少选择一个文档'); return; }
        if (!confirm(`确定要将选中的 ${ids.length} 个文档入库吗？`)) return;
        try {
            await window.electronAPI.batchMarkSource(ids);
            await loadPending();
        } catch (err) {
            console.error(err);
            alert('批量入库失败');
        }
    };

    const handleBatchDelete = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) { alert('请至少选择一个文档'); return; }
        if (!confirm(`确定删除选中的 ${ids.length} 个文档吗？`)) return;
        const result = await window.electronAPI.batchDelete(ids);
        alert(`删除完成：成功 ${result.successCount}，失败 ${result.failCount}`);
        await loadPending();
    };

    const isAllSelected = pendingDocs.length > 0 && pendingDocs.every((d: Document) => selectedIds.has(d.DocID));
    const formatRate = (rate: number): string => (rate * 100).toFixed(1) + '%';

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={styles.title}><i className="fa-solid fa-magnifying-glass"></i> 查重列表</h1>
            </div>

            <div style={styles.toolbar}>
                <div style={styles.toolbar}>
                    <button style={{ ...styles.button, ...styles.btnSuccess }} onClick={handleBatchConfirm}>批量入库</button>
                    <button style={{ ...styles.button, ...styles.btnDanger }} onClick={handleBatchDelete}>批量删除</button>
                    <button style={{ ...styles.button, ...styles.btnSecondary }} onClick={loadPending}>刷新</button>
                </div>
                <div style={styles.toolbar}>
                    <button style={{ ...styles.button, ...styles.btnSuccess }} onClick={handleImport}>单个查重</button>
                    <button style={{ ...styles.button, ...styles.btnPrimary }} onClick={handleBatchImport}>批量查重</button>
                </div>
            </div>

            {/* ===== 进度显示 ===== */}
            {progress && progress.type !== 'done' && (
                <div style={styles.progressBox}>
                    <strong>处理中:</strong> {progress.file || '...'} ({progress.status || '准备'})
                    <span style={{ marginLeft: 16 }}>
                        成功: {progress.success || 0} | 失败: {progress.failed || 0} | 跳过: {progress.skipped || 0}
                    </span>
                    {progress.total && progress.total > 0 && (
                        <span style={{ marginLeft: 16, color: '#718096' }}>
                            {progress.index != null ? (progress.index + 1) : 0}/{progress.total}
                        </span>
                    )}
                </div>
            )}

            {/* 列表（不在导入期间显示加载中） */}
            {loading ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>加载中...</div>
            ) : (
                <div style={styles.tableWrapper}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}><input type="checkbox" checked={isAllSelected} onChange={(e) => toggleSelectAll(e.target.checked)} /></th>
                                <th style={styles.th}>文件名</th>
                                <th style={styles.th}>类型</th>
                                <th style={styles.th}>段落数</th>
                                <th style={styles.th}>总字数</th>
                                <th style={styles.th}>最高重复率</th>
                                <th style={styles.th}>重复文档</th>
                                <th style={styles.th}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingDocs.length === 0 ? (
                                <tr><td colSpan={8} style={styles.empty}>暂无待确认的重复文档</td></tr>
                            ) : (
                                pendingDocs.map((doc: Document) => {
                                    const relations = repeatRelations.get(doc.DocID) || [];
                                    const maxRate = doc.RepeatRate || 0;
                                    return (
                                        <tr key={doc.DocID}>
                                            <td style={styles.td}><input type="checkbox" checked={selectedIds.has(doc.DocID)} onChange={() => toggleSelect(doc.DocID)} /></td>
                                            <td style={styles.td}>{doc.FileName}</td>
                                            <td style={styles.td}>{doc.FileName.endsWith('.docx') ? 'docx' : 'doc'}</td>
                                            <td style={styles.td}>{doc.ParagraphCount}</td>
                                            <td style={styles.td}>{doc.WordCount}</td>
                                            <td style={styles.td}>{formatRate(maxRate)}</td>
                                            <td style={styles.td}>
                                                {relations.length > 0 ? (
                                                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                                                        {relations.map((r, idx) => (
                                                            <li key={idx}>
                                                                {r.FileName} ({formatRate(r.pairRepeatRate || 0)})
                                                                {r.duplicateParagraphCount !== undefined && `, ${r.duplicateParagraphCount}段`}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : '无重复数据'}
                                            </td>
                                            <td style={styles.td}>
                                                <button style={styles.actionButton} onClick={() => handleView(doc)}>查看</button>
                                                <button style={styles.actionButton} onClick={() => handleConfirm(doc.DocID)}>入库</button>
                                                <button style={{ ...styles.actionButton, color: 'red', borderColor: 'red' }} onClick={() => handleDelete(doc.DocID)}>删除</button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {compareView && <CompareView docId={compareView.docId} docName={compareView.docName} onClose={() => setCompareView(null)} />}
        </div>
    );
};

export default DuplicateList;
