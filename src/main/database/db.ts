import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.resourcesPath || __dirname, '../../databases');
const DB_PATH = path.join(DB_DIR, 'app.db');

let db: Database.Database;

export function initDB() {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);

    // 开启外键约束
    db.pragma('foreign_keys = ON');

    db.exec(`
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
  `);
    return db;
}

export function getDB() {
  if (!db) initDB();
  return db;
}