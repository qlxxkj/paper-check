// src/renderer/pages/LogViewer.tsx
import React, { useState, useEffect } from 'react';
import { getCheckLogs } from '../api';

const styles: { [key: string]: React.CSSProperties } = {
    container: { padding: '16px 24px', },
    title: { fontSize: 24, fontWeight: 600, marginBottom: 8 },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
    th: { textAlign: 'left', padding: '8px 12px', backgroundColor: '#f7fafc', borderBottom: '2px solid #e2e8f0' },
    td: { padding: '8px 12px', borderBottom: '1px solid #e2e8f0' },
    loading: { textAlign: 'center', padding: 20, color: '#888' },
    error: { color: 'red', padding: 20 },
};

const LogViewer: React.FC = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getCheckLogs();
            setLogs(data || []);
        } catch (err: any) {
            console.error('[LogViewer] 加载日志失败:', err);
            setError('加载日志失败，请确保后端接口已实现。');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLogs();
    }, []);

    if (loading) return <div style={styles.loading}>加载日志中...</div>;
    if (error) return <div style={styles.error}>{error}</div>;

    return (
        <div style={styles.container}>
            <h2 style={styles.title}><i className="fa-regular fa-clipboard"></i> 操作日志</h2>
            <p style={{ color: '#666', marginBottom: 16 }}>记录每次导入/查重操作的历史。</p>
            {logs.length === 0 ? (
                <div style={styles.loading}>暂无日志记录</div>
            ) : (
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>执行时间</th>
                            <th style={styles.th}>总文件</th>
                            <th style={styles.th}>成功</th>
                            <th style={styles.th}>失败</th>
                            <th style={styles.th}>跳过</th>
                            <th style={styles.th}>文件列表</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map(log => (
                            <tr key={log.LogID}>
                                <td style={styles.td}>{new Date(log.ExecTime).toLocaleString()}</td>
                                <td style={styles.td}>{log.TotalFiles}</td>
                                <td style={styles.td}>{log.SuccessCount}</td>
                                <td style={styles.td}>{log.FailedCount}</td>
                                <td style={styles.td}>{log.SkippedCount}</td>
                                <td style={{ ...styles.td, maxWidth: 300 }}>
                                    <div style={{
                                        maxHeight: 80,
                                        overflowY: 'auto',
                                        fontSize: 12,
                                        lineHeight: 1.5,
                                        wordBreak: 'break-all',
                                    }}>
                                        {(() => {
                                            try {
                                                const files = JSON.parse(log.FileList || '[]');
                                                const names = files.map((p: string) => p.split(/[/\\]/).pop());
                                                return names.join(', ');
                                            } catch { return log.FileList; }
                                        })()}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <button onClick={loadLogs} style={{ marginTop: 12, padding: '6px 12px', cursor: 'pointer' }}>刷新</button>
        </div>
    );
};

export default LogViewer;