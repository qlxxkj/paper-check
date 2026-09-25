import React, { useState, useEffect } from 'react';
import {
    onImportProgress,
    backupDB,
    openFolderDialog,
    importLegacyFolder,
    rebuildNGramIndex,
} from '../api';

const DatabaseMaintenance: React.FC = () => {
    const [sql, setSql] = useState('');
    const [result, setResult] = useState('');
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ success: number; failed: number; items: any[] } | null>(null);
    const [progress, setProgress] = useState<any>(null);
    const [rebuilding, setRebuilding] = useState(false);
    const [rebuildResult, setRebuildResult] = useState<{ rebuilt: number; skipped: number } | null>(null);

    // 监听主进程推送的导入进度
    useEffect(() => {
        const handler = (data: any) => {
            if (data.type === 'start' || data.type === 'progress') {
                setProgress(data);
            } else if (data.type === 'done') {
                setProgress(null);
            }
        };
        const unsub = onImportProgress(handler);
        return unsub;
    }, []);

    const handleBackup = async () => {
        await backupDB();
        alert('备份完成');
    };

    const handleBatchImport = async () => {
        const folderPath = await openFolderDialog();
        if (!folderPath) return;
        setImporting(true);
        setProgress(null);
        setImportResult(null);

        try {
            const res = await importLegacyFolder(folderPath);
            setImportResult({
                success: res.filter((r: any) => r.status === 'success').length,
                failed: res.filter((r: any) => r.status === 'failed').length,
                items: res,
            });
        } catch (err: any) {
            alert('导入失败：' + err.message);
        } finally {
            setImporting(false);
        }
    };

    return (
        <div style={{ fontFamily: 'Segoe UI, Roboto, sans-serif', padding: '20px 24px' }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: 20, fontWeight: 600, color: '#1a2a3a' }}>
                <i className="fas fa-database" style={{ marginRight: 8, color: '#3b82f6' }}></i>
                数据库维护
            </h2>

            {/* 批量导入存量文档 */}
            <div style={{
                backgroundColor: '#fff',
                borderRadius: 10,
                padding: '20px 24px',
                marginBottom: 20,
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 600, color: '#2d3748' }}>
                    <i className="fas fa-folder-open" style={{ marginRight: 6, color: '#3b82f6' }}></i>
                    批量导入存量文档
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#718096', lineHeight: 1.6 }}>
                    选择包含 Word 文档的文件夹，系统将递归扫描所有 .docx / .doc 文件，直接入库（不查重），
                    适用于初始化已人工查重过的存量文档。
                </p>

                <button
                    onClick={handleBatchImport}
                    disabled={importing}
                    style={{
                        padding: '8px 20px',
                        borderRadius: 6,
                        border: 'none',
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: importing ? 'not-allowed' : 'pointer',
                        backgroundColor: importing ? '#a0aec0' : '#2b6cb0',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    <i className="fas fa-upload"></i>
                    {importing ? '导入中...' : '选择文件夹批量导入'}
                </button>

                {/* 进度 */}
                {progress && (
                    <div style={{
                        marginTop: 16,
                        padding: '10px 14px',
                        backgroundColor: '#f7fafc',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        fontSize: 13,
                        color: '#2d3748',
                    }}>
                        {progress.type === 'start' ? (
                            <span>{progress.status}</span>
                        ) : (
                            <span>
                                正在处理：<strong>{progress.file}</strong>
                                &nbsp;|&nbsp;
                                {progress.index}/{progress.total}&nbsp;
                                |&nbsp;成功：{progress.success}&nbsp;|&nbsp;失败：{progress.failed}
                            </span>
                        )}
                    </div>
                )}

                {/* 结果 */}
                {importResult && (
                    <div style={{
                        marginTop: 12,
                        padding: '12px 14px',
                        backgroundColor: importResult.failed > 0 ? '#fffbeb' : '#f0fff4',
                        borderRadius: 6,
                        border: `1px solid ${importResult.failed > 0 ? '#fbd38d' : '#9ae6b4'}`,
                        fontSize: 13,
                    }}>
                        <strong>
                            {importResult.failed > 0
                                ? `导入完成：成功 ${importResult.success} 个，失败 ${importResult.failed} 个`
                                : `导入完成！成功导入 ${importResult.success} 个文档`}
                        </strong>
                        {importResult.failed > 0 && importResult.items.some((r: any) => r.status === 'failed') && (
                            <div style={{ marginTop: 8 }}>
                                <details>
                                    <summary style={{ cursor: 'pointer', color: '#c53030', fontWeight: 500 }}>
                                        查看失败详情
                                    </summary>
                                    <pre style={{
                                        marginTop: 8,
                                        fontSize: 12,
                                        color: '#742a2a',
                                        maxHeight: 200,
                                        overflowY: 'auto',
                                        whiteSpace: 'pre-wrap',
                                    }}>
                                        {importResult.items
                                            .filter((r: any) => r.status === 'failed')
                                            .map((r: any) => `[失败] ${r.filePath}\n  ${r.error}`)
                                            .join('\n\n')}
                                    </pre>
                                </details>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 备份 */}
            <div style={{
                backgroundColor: '#fff',
                borderRadius: 10,
                padding: '20px 24px',
                marginBottom: 20,
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 600, color: '#2d3748' }}>
                    <i className="fas fa-archive" style={{ marginRight: 6, color: '#3b82f6' }}></i>
                    备份数据库
                </h3>
                <button
                    onClick={handleBackup}
                    style={{
                        padding: '8px 20px',
                        borderRadius: 6,
                        border: 'none',
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: 'pointer',
                        backgroundColor: '#2b8c4e',
                        color: '#fff',
                    }}
                >
                    <i className="fas fa-download" style={{ marginRight: 6 }}></i>备份数据库
                </button>
            </div>

            {/* 重建 N-gram 索引 */}
            <div style={{
                backgroundColor: '#fff',
                borderRadius: 10,
                padding: '20px 24px',
                marginBottom: 20,
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 600, color: '#2d3748' }}>
                    <i className="fas fa-sync-alt" style={{ marginRight: 6, color: '#d69e2e' }}></i>
                    重建 N-gram 索引
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#718096', lineHeight: 1.6 }}>
                    当 ngramLength 配置变更后，需要重建所有文档的 N-gram 索引才能使查重功能恢复正常。
                    此操作会清除旧索引并重新构建，不会影响文档数据。
                </p>

                <button
                    onClick={async () => {
                        if (!confirm('确定要重建所有文档的 N-gram 索引吗？此操作可能需要一些时间。')) return;
                        setRebuilding(true);
                        setRebuildResult(null);
                        try {
                            const res = await rebuildNGramIndex();
                            setRebuildResult(res);
                        } catch (err: any) {
                            alert('重建失败：' + err.message);
                        } finally {
                            setRebuilding(false);
                        }
                    }}
                    disabled={rebuilding}
                    style={{
                        padding: '8px 20px',
                        borderRadius: 6,
                        border: 'none',
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: rebuilding ? 'not-allowed' : 'pointer',
                        backgroundColor: rebuilding ? '#a0aec0' : '#d69e2e',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    <i className={`fas ${rebuilding ? 'fa-spin fa-sync' : 'fa-sync'}`}></i>
                    {rebuilding ? '重建中...' : '重建 N-gram 索引'}
                </button>

                {rebuildResult && (
                    <div style={{
                        marginTop: 12,
                        padding: '10px 14px',
                        backgroundColor: rebuildResult.skipped > 0 ? '#fffbeb' : '#f0fff4',
                        borderRadius: 6,
                        border: `1px solid ${rebuildResult.skipped > 0 ? '#fbd38d' : '#9ae6b4'}`,
                        fontSize: 13,
                    }}>
                        重建完成：成功 <strong>{rebuildResult.rebuilt}</strong> 个，跳过 <strong>{rebuildResult.skipped}</strong> 个（无段落数据）
                    </div>
                )}
            </div>
        </div>
    );
};
export default DatabaseMaintenance;
