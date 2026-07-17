import React, { useState, useEffect } from 'react';

declare global {
  interface Window {
    electronAPI: any;
  }
}

const App: React.FC = () => {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<any>(null);

  useEffect(() => {
    loadDocs();
    // 监听进度
    window.electronAPI.onImportProgress((data: any) => {
      setProgress(data);
    });
  }, []);

  const loadDocs = async () => {
    const list = await window.electronAPI.getSourceDocs();
    setDocs(list);
  };

  const handleImport = async () => {
    // 使用 Electron 的 dialog 选择文件
    // 实际应该由主进程调用，我们使用预置API
    // 简化：通过主进程的 dialog 选择文件，我们可以在 main 中暴露一个方法
    // 这里暂时使用 input 模拟，但 Electron 中推荐使用 dialog
    // 实际项目中可调用 window.electronAPI.openFileDialog()
    // 我们假设已经实现了 openFileDialog 返回路径数组
    // 为了演示，我们直接硬编码一些测试文件路径（实际需由用户选择）
    const result = await window.electronAPI.importFiles(['C:/test.docx']); // 替换
    if (result) {
      loadDocs();
    }
  };

  const handleBackup = async () => {
    await window.electronAPI.backupDB();
    alert('备份完成');
  };

  const handleClear = async () => {
    if (confirm('确定清空所有数据吗？')) {
      await window.electronAPI.clearAll();
      loadDocs();
    }
  };

  return (
    <div>
      <h1>Word文档查重系统</h1>
      <div>
        <button onClick={handleImport}>导入文件</button>
        <button onClick={handleBackup}>备份数据库</button>
        <button onClick={handleClear}>清空数据</button>
      </div>
      {progress && (
        <div>
          <p>处理中: {progress.file} ({progress.status})</p>
          <p>成功: {progress.success || 0}, 失败: {progress.failed || 0}, 跳过: {progress.skipped || 0}</p>
        </div>
      )}
      <h2>源文档列表</h2>
      <table border={1} cellPadding={5}>
        <thead>
          <tr>
            <th>文件名</th>
            <th>段落数</th>
            <th>总字数</th>
            <th>重复率</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {docs.map(doc => (
            <tr key={doc.DocID}>
              <td>{doc.FileName}</td>
              <td>{doc.ParagraphCount}</td>
              <td>{doc.WordCount}</td>
              <td>{(doc.RepeatRate * 100).toFixed(1)}%</td>
              <td>{doc.RepeatStatus === 0 ? '无重复' : doc.RepeatStatus === 1 ? '部分重复' : '完全重复'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default App;