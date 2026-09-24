package backup

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// 对齐 src/main/backup/backupRestore.ts

// BackupDB 把当前数据库文件复制到 destDir 下带时间戳的备份文件
func BackupDB(src, destDir string) bool {
	name := fmt.Sprintf("backup_%d.db", time.Now().UnixNano())
	dest := filepath.Join(destDir, name)
	data, err := os.ReadFile(src)
	if err != nil {
		return false
	}
	if err := os.WriteFile(dest, data, 0o644); err != nil {
		return false
	}
	return true
}

// RestoreDB 用备份文件覆盖数据库文件。
// 注意：调用方需先 Close 数据库连接再调用，恢复后重新 Open。
// 这里通过传入 src 备份路径 + 目标 dbPath 完成文件级替换。
func RestoreDB(backupPath, dbPath string) bool {
	data, err := os.ReadFile(backupPath)
	if err != nil {
		return false
	}
	if err := os.WriteFile(dbPath, data, 0o644); err != nil {
		return false
	}
	return true
}

// CloseDB 关闭连接（供恢复前调用）
func CloseDB(d *sql.DB) error {
	return d.Close()
}
