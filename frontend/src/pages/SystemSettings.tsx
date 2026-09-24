import React, { useState, useEffect } from 'react';
import { getConfig, saveConfig } from '../api';

// 配置项定义
interface ConfigItem {
    key: string;
    label: string;
    description: string;
    type: 'number' | 'boolean';
    min?: number;
    max?: number;
    step?: number;
}

const configDefinitions: ConfigItem[] = [
    {
        key: 'fullDuplicateThreshold',
        label: '完全重复阈值',
        description: '当重复率 >= 该值时，文档被标记为“完全重复”。取值范围 0~1，建议 0.9~0.999。',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.001,
    },
    {
        key: 'partialDuplicateThreshold',
        label: '部分重复阈值',
        description: '当重复率 >= 该值时，文档被标记为“部分重复”；低于该值视为无重复。取值范围 0~1，建议 0.01~0.1。',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.001,
    },
    {
        key: 'diffThreshold',
        label: '段落匹配阈值',
        description: '段落相似度 >= 该值时才会被计入重复段落。越小越灵敏，建议 0.005~0.05。',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.001,
    },
    {
        key: 'ngramLength',
        label: 'N-gram 窗口长度',
        description: '用于粗筛的连续字符长度。越小越敏感（召回更多候选），建议 10~20。',
        type: 'number',
        min: 5,
        max: 30,
        step: 1,
    },
    {
        key: 'minSharedNgrams',
        label: '最少共享 N-gram 数',
        description: '两个文档至少共享多少个 N-gram 才会被列为候选对比文档。越大越严格，建议 3~10。',
        type: 'number',
        min: 1,
        max: 20,
        step: 1,
    },
    {
        key: 'minMatchChars',
        label: '最小匹配字符数（旧）',
        description: '已弃用，保留用于兼容。',
        type: 'number',
        min: 1,
        max: 50,
        step: 1,
    },
    {
        key: 'sensitivity',
        label: '灵敏度（旧）',
        description: '已弃用，保留用于兼容。',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
    },
    {
        key: 'enableRefFilter',
        label: '启用参考文献过滤',
        description: '是否自动排除参考文献部分，不参与查重。',
        type: 'boolean',
    },
    {
        key: 'contextSize',
        label: '上下文引用范围',
        description: '在对比视图中点击高亮段落后，显示前后各多少段落作为上下文。建议 1~10，默认 3。',
        type: 'number',
        min: 1,
        max: 20,
        step: 1,
    },
];

const SystemSettings: React.FC = () => {
    const [config, setConfig] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            const data = await getConfig();
            setConfig(data);
        } catch (err) {
            console.error(err);
            setMessage('加载配置失败');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (key: string, value: any) => {
        setConfig({ ...config, [key]: value });
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage('');
        try {
            const result = await saveConfig(config);
            if (result.success) {
                setMessage('配置保存成功，重启导入任务后生效');
            } else {
                setMessage('保存失败：' + result.error);
            }
        } catch (err) {
            setMessage('保存异常：' + String(err));
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: 20 }}>加载配置中...</div>;

    return (
        <div style={{ padding: 20, fontFamily: 'Segoe UI, sans-serif', maxWidth: 600 }}>
            <h2><i className="fa-solid fa-gear"></i> 查重参数设置</h2>
            <p style={{ color: '#666', fontSize: 14 }}>修改后点击保存，后续导入将使用新参数。</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {configDefinitions.map((def) => {
                    const value = config[def.key] !== undefined ? config[def.key] : '';
                    return (
                        <div key={def.key} style={{ borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>{def.label}</label>
                            {def.type === 'boolean' ? (
                                <input
                                    type="checkbox"
                                    checked={!!value}
                                    onChange={(e) => handleChange(def.key, e.target.checked)}
                                />
                            ) : (
                                <input
                                    type="number"
                                    value={value}
                                    min={def.min}
                                    max={def.max}
                                    step={def.step}
                                    onChange={(e) => handleChange(def.key, parseFloat(e.target.value) || 0)}
                                    style={{ width: '100%', padding: 6, border: '1px solid #ccc', borderRadius: 4 }}
                                />
                            )}
                            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{def.description}</div>
                        </div>
                    );
                })}
            </div>
            <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        padding: '8px 24px',
                        backgroundColor: '#2b6cb0',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 14,
                    }}
                >
                    {saving ? '保存中...' : '保存配置'}
                </button>
                <span style={{ fontSize: 14, color: message.includes('成功') ? 'green' : 'red' }}>{message}</span>
            </div>
        </div>
    );
};

export default SystemSettings;