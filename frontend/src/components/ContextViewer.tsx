// src/renderer/components/ContextView.tsx
import React from 'react';

interface ContextViewProps {
    docId: number;
    paraIndex: number;
    context: { ParaIndex: number; ParaText: string }[];
    onClose: () => void;
}

const ContextView: React.FC<ContextViewProps> = ({ docId, paraIndex, context, onClose }) => {
    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
        }}>
            <div style={{
                backgroundColor: '#fff',
                borderRadius: 8,
                padding: 24,
                maxWidth: 600,
                maxHeight: '80vh',
                overflow: 'auto',
                boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            }}>
                <h3>上下文（段落 {paraIndex} 前后）</h3>

                {
                context.length === 0 ? (
                    <div>
                        <p style={{ color: '#888' }}>未找到该段落的上下文数据</p>
                            <p style={{ fontSize: 12, color: '#888' }}>文档ID: {docId}，段落索引: {paraIndex}</p>
                            <p style={{ fontSize: 12, color: '#888' }}>可能原因：该文档未正确插入段落，或索引超出范围。</p>
                    </div>
                    ) :
                context.map(p => (
                    <div key={p.ParaIndex} style={{
                        padding: '4px 0',
                        borderBottom: p.ParaIndex === paraIndex ? '2px solid #2b6cb0' : '1px solid #eee',
                        backgroundColor: p.ParaIndex === paraIndex ? '#ebf8ff' : 'transparent',
                    }}>
                        <span style={{ fontWeight: 'bold', marginRight: 8 }}>[{p.ParaIndex}]</span>
                        {p.ParaText}
                    </div>
                    )
                )}
                <button onClick={onClose} style={{ marginTop: 16, padding: '6px 16px', cursor: 'pointer' }}>关闭</button>
            </div>
        </div>
    );
};

export default ContextView;