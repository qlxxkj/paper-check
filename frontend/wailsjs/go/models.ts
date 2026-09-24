export namespace config {
	
	export class AppConfig {
	    minMatchChars: number;
	    sensitivity: number;
	    enableRefFilter: boolean;
	    fullDuplicateThreshold: number;
	    partialDuplicateThreshold: number;
	    diffThreshold: number;
	    ngramLength: number;
	    minSharedNgrams: number;
	    contextSize: number;
	
	    static createFrom(source: any = {}) {
	        return new AppConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.minMatchChars = source["minMatchChars"];
	        this.sensitivity = source["sensitivity"];
	        this.enableRefFilter = source["enableRefFilter"];
	        this.fullDuplicateThreshold = source["fullDuplicateThreshold"];
	        this.partialDuplicateThreshold = source["partialDuplicateThreshold"];
	        this.diffThreshold = source["diffThreshold"];
	        this.ngramLength = source["ngramLength"];
	        this.minSharedNgrams = source["minSharedNgrams"];
	        this.contextSize = source["contextSize"];
	    }
	}

}

export namespace db {
	
	export class CheckLog {
	    LogID: number;
	    ExecTime: string;
	    TotalFiles: number;
	    SuccessCount: number;
	    FailedCount: number;
	    SkippedCount: number;
	    FileList: string;
	    Details: string;
	
	    static createFrom(source: any = {}) {
	        return new CheckLog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.LogID = source["LogID"];
	        this.ExecTime = source["ExecTime"];
	        this.TotalFiles = source["TotalFiles"];
	        this.SuccessCount = source["SuccessCount"];
	        this.FailedCount = source["FailedCount"];
	        this.SkippedCount = source["SkippedCount"];
	        this.FileList = source["FileList"];
	        this.Details = source["Details"];
	    }
	}
	export class Document {
	    DocID: number;
	    FileName: string;
	    FilePath: string;
	    FileSize: number;
	    ParagraphCount: number;
	    WordCount: number;
	    FullTextHash: string;
	    IsSource: number;
	    RepeatStatus: number;
	    RepeatRate: number;
	    CreateTime: string;
	    ExcludedRefWords: number;
	
	    static createFrom(source: any = {}) {
	        return new Document(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.DocID = source["DocID"];
	        this.FileName = source["FileName"];
	        this.FilePath = source["FilePath"];
	        this.FileSize = source["FileSize"];
	        this.ParagraphCount = source["ParagraphCount"];
	        this.WordCount = source["WordCount"];
	        this.FullTextHash = source["FullTextHash"];
	        this.IsSource = source["IsSource"];
	        this.RepeatStatus = source["RepeatStatus"];
	        this.RepeatRate = source["RepeatRate"];
	        this.CreateTime = source["CreateTime"];
	        this.ExcludedRefWords = source["ExcludedRefWords"];
	    }
	}
	export class ParaCtx {
	    ParaIndex: number;
	    ParaText: string;
	
	    static createFrom(source: any = {}) {
	        return new ParaCtx(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ParaIndex = source["ParaIndex"];
	        this.ParaText = source["ParaText"];
	    }
	}
	export class Paragraph {
	    ParaID: number;
	    DocID: number;
	    ParaIndex: number;
	    ParaText: string;
	    ParaHash: string;
	    Length: number;
	
	    static createFrom(source: any = {}) {
	        return new Paragraph(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ParaID = source["ParaID"];
	        this.DocID = source["DocID"];
	        this.ParaIndex = source["ParaIndex"];
	        this.ParaText = source["ParaText"];
	        this.ParaHash = source["ParaHash"];
	        this.Length = source["Length"];
	    }
	}

}

export namespace dedup {
	
	export class HighlightSegment {
	    text: string;
	    isHighlight: boolean;
	
	    static createFrom(source: any = {}) {
	        return new HighlightSegment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.text = source["text"];
	        this.isHighlight = source["isHighlight"];
	    }
	}
	export class DiffResult {
	    DocID1: number;
	    DocID2: number;
	    paraIndex1: number;
	    paraIndex2: number;
	    doc1ParaText: string;
	    doc2ParaText: string;
	    highlights: HighlightSegment[];
	    matchRate: number;
	
	    static createFrom(source: any = {}) {
	        return new DiffResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.DocID1 = source["DocID1"];
	        this.DocID2 = source["DocID2"];
	        this.paraIndex1 = source["paraIndex1"];
	        this.paraIndex2 = source["paraIndex2"];
	        this.doc1ParaText = source["doc1ParaText"];
	        this.doc2ParaText = source["doc2ParaText"];
	        this.highlights = this.convertValues(source["highlights"], HighlightSegment);
	        this.matchRate = source["matchRate"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace importsvc {
	
	export class ImportResult {
	    success: number;
	    failed: number;
	    skipped: number;
	
	    static createFrom(source: any = {}) {
	        return new ImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.failed = source["failed"];
	        this.skipped = source["skipped"];
	    }
	}

}

