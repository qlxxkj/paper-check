import { Worker } from 'worker_threads';
import path from 'path';


export async function importFilesHandler(
    filePaths: string[],
    onProgress: (data: any) => void,
    config: any,
    dbPath: string // 新增
) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'importWorker.js'), {
        workerData: { filePaths, config, dbPath }
    });
    let hasShownConfirm = false;
    worker.on('message', async (msg) => {
      onProgress(msg);
      if (msg.type === 'done') {
        resolve({ success: msg.success, failed: msg.failed, skipped: msg.skipped });
      }
      // 处理无重复确认逻辑（需要主进程弹窗）
      if (msg.type === 'progress' && msg.status === 'success' && msg.repeatRate === 0) {
        // 由于 worker 无法直接弹窗，我们通过主进程处理
        // 但为了简单，我们在 worker 中不做，而是在主进程收到 done 后查询所有重复率为0的文档并弹窗
      }
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}