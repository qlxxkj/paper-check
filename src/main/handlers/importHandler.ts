import { Worker } from 'worker_threads';
import path from 'path';

interface ProgressMessage {
    type: 'progress' | 'done';
    file?: string;
    status?: string;
    error?: string;
    reason?: string;
    docId?: number;
    repeatRate?: number;
    isSource?: boolean;
    repeatParaCount?: number;
    index?: number;  // 全局文件序号（0-based）
    total?: number;  // 总文件数
    success?: number;
    failed?: number;
    skipped?: number;
}

export async function importFilesHandler(
    filePaths: string[],
    onProgress: (data: any) => void,
    config: any,
    dbPath: string
): Promise<{ success: number; failed: number; skipped: number }> {
    return new Promise((resolve) => {
        const total = filePaths.length;

        // 确定 worker 数量：最多 4 个，且不超过文件数
        const workerCount = Math.min(4, total);
        const chunkSize = Math.ceil(total / workerCount);

        // 将文件列表切分为多个块
        const chunks: string[][] = [];
        for (let i = 0; i < total; i += chunkSize) {
            chunks.push(filePaths.slice(i, i + chunkSize));
        }

        if (chunks.length === 0) {
            resolve({ success: 0, failed: 0, skipped: 0 });
            return;
        }

        let completedWorkers = 0;
        let totalSuccess = 0;
        let totalFailed = 0;
        let totalSkipped = 0;
        // 标记已完成的 worker，防止 message(done) + exit 重复计数
        const workerDone = new Set<number>();

        console.log(`[ImportHandler] 启动 ${chunks.length} 个 worker 并行处理 ${total} 个文件`);

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];
            const startIndex = chunkIndex * chunkSize;

            const worker = new Worker(path.join(__dirname, 'importWorker.js'), {
                workerData: {
                    filePaths: chunk,
                    config,
                    dbPath,
                    total,       // 所有 worker 共享同一个总数，用于进度计算
                    startIndex,  // 本 worker 在全局文件列表中的起始索引
                }
            });

            const finishWorker = (success: number, failed: number, skipped: number) => {
                if (workerDone.has(chunkIndex)) return;
                workerDone.add(chunkIndex);
                totalSuccess += success;
                totalFailed += failed;
                totalSkipped += skipped;
                completedWorkers++;
                console.log(`[ImportHandler] Worker ${chunkIndex + 1}/${chunks.length} 完成，当前累计: ${totalSuccess}成功 ${totalFailed}失败 ${totalSkipped}跳过`);
                if (completedWorkers === chunks.length) {
                    onProgress({
                        type: 'done',
                        success: totalSuccess,
                        failed: totalFailed,
                        skipped: totalSkipped,
                    });
                    resolve({ success: totalSuccess, failed: totalFailed, skipped: totalSkipped });
                }
            };

            worker.on('message', (msg: ProgressMessage) => {
                if (msg.type === 'progress') {
                    onProgress(msg);
                } else if (msg.type === 'done') {
                    if (workerDone.has(chunkIndex)) return;
                    finishWorker(msg.success || 0, msg.failed || 0, msg.skipped || 0);
                }
            });

            worker.on('error', (err) => {
                console.error(`[ImportHandler] Worker ${chunkIndex} 错误:`, err);
                if (!workerDone.has(chunkIndex)) finishWorker(0, 0, 0);
            });

            worker.on('exit', (code) => {
                if (code !== 0) {
                    console.error(`[ImportHandler] Worker ${chunkIndex} 异常退出码: ${code}`);
                }
                // 非零退出码表示异常，需要补一次 finishWorker；正常退出由 'done' 消息处理
                if (code !== 0 && !workerDone.has(chunkIndex)) {
                    finishWorker(0, 0, 0);
                }
            });
        }
    });
}
