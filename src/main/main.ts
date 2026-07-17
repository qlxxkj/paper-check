import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { initDB } from './database/db';
import { importFilesHandler } from './handlers/importHandler';
import { getSourceDocs, deleteAllData } from './database/models';
import { backupDB, restoreDB } from './backup/backupRestore';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  // 开发环境打开调试
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  initDB();
  createWindow();
  registerIpcHandlers();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpcHandlers() {
  // 导入文件
  ipcMain.handle('import-files', async (event, filePaths: string[]) => {
    return importFilesHandler(filePaths, (progress) => {
      event.sender.send('import-progress', progress);
    });
  });

  // 获取源文档列表
  ipcMain.handle('get-source-docs', async () => {
    return getSourceDocs();
  });

  // 备份数据库
  ipcMain.handle('backup-db', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return backupDB(result.filePaths[0]);
    }
    return false;
  });

  // 恢复数据库
  ipcMain.handle('restore-db', async (_, backupPath: string) => {
    return restoreDB(backupPath);
  });

  // 清空数据
  ipcMain.handle('clear-all', async () => {
    return deleteAllData();
  });
}