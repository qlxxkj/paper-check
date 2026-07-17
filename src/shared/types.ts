export interface Document {
  DocID: number;
  FileName: string;
  FilePath: string;
  FileSize: number;
  ParagraphCount: number;
  WordCount: number;
  FullTextHash: string;
  IsSource: number;
  RepeatStatus: number; // 0-无重复,1-部分,2-完全
  RepeatRate: number;
  CreateTime: string;
  ExcludedRefWords: number;
}

export interface Paragraph {
  ParaID: number;
  DocID: number;
  ParaIndex: number;
  ParaText: string;
  ParaHash: string;
  Length: number;
}

export interface RepeatRecord {
  ID: number;
  SourceDocID: number;
  TargetDocID: number;
  RepeatParaCount: number;
  RepeatRate: number;
}