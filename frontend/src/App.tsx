import React, { useState } from 'react';
import DocumentManager from './pages/DocumentManager';
import DuplicateList from './pages/DuplicateList';
import SystemSettings from './pages/SystemSettings';
import LogViewer from './pages/LogViewer';
import DatabaseMaintenance from './pages/DatabaseMaintenance';

// 菜单定义
const menuItems = [
    { key: 'duplicates', label: '查重列表', icon: 'fa-solid fa-magnifying-glass', component: DuplicateList },
    { key: 'documents', label: '文档列表', icon: 'fa-regular fa-file-lines', component: DocumentManager },
    { key: 'settings', label: '查重配置', icon: 'fa-solid fa-gear', component: SystemSettings },
    { key: 'logs', label: '日志记录', icon: 'fa-regular fa-clipboard', component: LogViewer },
    { key: 'db', label: '数据库维护', icon: 'fa-solid fa-database', component: DatabaseMaintenance },
];

const App: React.FC = () => {
    const [activeKey, setActiveKey] = useState('duplicates');
    const [collapsed, setCollapsed] = useState(false);

    const ActiveComponent = menuItems.find(item => item.key === activeKey)?.component || DuplicateList;

    return (
        <div style={{ display: 'flex', height: '100vh' }}>
            {/* 左侧菜单 */}
            <div style={{
                width: collapsed ? 60 : 220,
                backgroundColor: '#1e293b',
                color: '#cbd5e1',
                display: 'flex',
                flexDirection: 'column',
                transition: 'width 0.2s',
                flexShrink: 0,
                overflow: 'hidden',
            }}>
                <div style={{ padding: '16px 12px', fontSize: 18, fontWeight: 600, color: '#fff', borderBottom: '1px solid #334155' }}>
                    {collapsed ? <i className="fa-solid fa-check-double"></i> : '查重系统'}
                </div>
                {menuItems.map(item => (
                    <div
                        key={item.key}
                        onClick={() => setActiveKey(item.key)}
                        style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            backgroundColor: activeKey === item.key ? '#334155' : 'transparent',
                            borderLeft: activeKey === item.key ? '3px solid #3b82f6' : '3px solid transparent',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {collapsed ? <i className={item.icon}></i> : <><i className={item.icon}></i> {item.label}</>}
                    </div>
                ))}
                <div style={{ marginTop: 'auto', padding: 20, borderTop: '1px solid #334155', cursor: 'pointer', textAlign: 'center' }} onClick={() => setCollapsed(!collapsed)}>
                    {collapsed ? <i className="fa-solid fa-chevron-right"></i> : <><i className="fa-solid fa-chevron-left"></i> 收起</>}
                </div>
            </div>

            {/* 右侧内容 */}
            <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#f1f5f9', padding: 20 }}>
                <ActiveComponent />
            </div>
        </div>
    );
};

export default App;