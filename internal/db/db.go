package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// schema 原样保留自 src/main/database/db.ts 的建表 SQL，保证老 app.db 兼容
const schema = `
CREATE TABLE IF NOT EXISTS Document (
  DocID INTEGER PRIMARY KEY AUTOINCREMENT,
  FileName TEXT,
  FilePath TEXT,
  FileSize INTEGER,
  ParagraphCount INTEGER,
  WordCount INTEGER,
  FullTextHash TEXT,
  IsSource INTEGER DEFAULT 0,
  RepeatStatus INTEGER DEFAULT 0,
  RepeatRate REAL DEFAULT 0,
  CreateTime TEXT,
  ExcludedRefWords INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS Paragraph (
  ParaID INTEGER PRIMARY KEY AUTOINCREMENT,
  DocID INTEGER,
  ParaIndex INTEGER,
  ParaText TEXT,
  ParaHash TEXT,
  Length INTEGER,
  FOREIGN KEY(DocID) REFERENCES Document(DocID) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ParaHashIndex (
  ParaHash TEXT,
  DocID INTEGER,
  ParaIndex INTEGER,
  FOREIGN KEY(DocID) REFERENCES Document(DocID) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hash ON ParaHashIndex(ParaHash);

CREATE TABLE IF NOT EXISTS RepeatRecord (
  ID INTEGER PRIMARY KEY AUTOINCREMENT,
  SourceDocID INTEGER,
  TargetDocID INTEGER,
  RepeatParaCount INTEGER,
  RepeatRate REAL,
  FOREIGN KEY(SourceDocID) REFERENCES Document(DocID) ON DELETE CASCADE,
  FOREIGN KEY(TargetDocID) REFERENCES Document(DocID) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS NGramIndex (
  ngram TEXT,
  DocID INTEGER,
  ParaIndex INTEGER,
  FOREIGN KEY(DocID) REFERENCES Document(DocID) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ngram ON NGramIndex(ngram);

CREATE TABLE IF NOT EXISTS DiffResult (
  ID INTEGER PRIMARY KEY AUTOINCREMENT,
  DocID1 INTEGER,
  DocID2 INTEGER,
  ParaIndex1 INTEGER,
  ParaIndex2 INTEGER,
  Highlights TEXT,
  FOREIGN KEY(DocID1) REFERENCES Document(DocID) ON DELETE CASCADE,
  FOREIGN KEY(DocID2) REFERENCES Document(DocID) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_diff_docs ON DiffResult(DocID1, DocID2);

CREATE TABLE IF NOT EXISTS CheckLog (
    LogID INTEGER PRIMARY KEY AUTOINCREMENT,
    ExecTime TEXT,
    TotalFiles INTEGER,
    SuccessCount INTEGER,
    FailedCount INTEGER,
    SkippedCount INTEGER,
    FileList TEXT,
    Details TEXT
);
CREATE INDEX IF NOT EXISTS idx_log_time ON CheckLog(ExecTime);
`

// 打开数据库并初始化 schema。WAL + busy_timeout 对齐原 better-sqlite3 配置。
func Open(dbPath string) (*sql.DB, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("创建数据库目录失败: %w", err)
	}
	d, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	// modernc sqlite 默认每个连接独立池；单写连接保证事务一致性
	d.SetMaxOpenConns(1)
	if _, err := d.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return nil, err
	}
	if _, err := d.Exec("PRAGMA journal_mode = WAL"); err != nil {
		return nil, err
	}
	if _, err := d.Exec("PRAGMA busy_timeout = 10000"); err != nil {
		return nil, err
	}
	if _, err := d.Exec(schema); err != nil {
		return nil, fmt.Errorf("初始化数据库 schema 失败: %w", err)
	}
	return d, nil
}
