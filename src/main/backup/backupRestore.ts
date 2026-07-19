import fs from 'fs';
import path from 'path';
import { getDB } from '../database/db';

export function backupDB(destDir: string): boolean {
  const db = getDB();
  const src = db.name; // 数据库文件路径
  const dest = path.join(destDir, `backup_${Date.now()}.db`);
  try {
    fs.copyFileSync(src, dest);
    return true;
  } catch {
    return false;
  }
}

export function restoreDB(backupPath: string): boolean {
  try {
    const db = getDB();
    db.close();
    const src = backupPath;
    const dest = db.name;
    fs.copyFileSync(src, dest);
    // 重新打开
      require('../database/db').initDB();
    return true;
  } catch {
    return false;
  }
}