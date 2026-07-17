import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.resourcesPath || __dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

export function log(message: string) {
  const logFile = path.join(LOG_DIR, `app_${new Date().toISOString().slice(0,10)}.log`);
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
}