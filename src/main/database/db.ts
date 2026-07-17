import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.resourcesPath || __dirname, '../../databases');
const DB_PATH = path.join(DB_DIR, 'app.db');

let db: Database.Database;

export function initDB() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
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
      FOREIGN KEY(DocID) REFERENCES Document(DocID)
    );
    CREATE TABLE IF NOT EXISTS ParaHashIndex (
      ParaHash TEXT,
      DocID INTEGER,
      ParaIndex INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_hash ON ParaHashIndex(ParaHash);
    CREATE TABLE IF NOT EXISTS RepeatRecord (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      SourceDocID INTEGER,
      TargetDocID INTEGER,
      RepeatParaCount INTEGER,
      RepeatRate REAL
    );
  `);
  return db;
}

export function getDB() {
  if (!db) initDB();
  return db;
}