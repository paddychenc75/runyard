import type { AbsPath, PosixRelPath } from "@runyard/platform";
import type {
  CreatedBy,
  LibraryEntry,
  Notice,
  Playground,
  PlaygroundFile,
} from "@runyard/protocol";

// 资源库的类型与接缝。下面标了“接缝”的几处由别的 issue 接上，不改这里的类型：
// 端口槽位（#36）、模板来源（模板各 issue）。

/** 接缝：端口槽位（#36）。返回 null 表示这种运行器没有端口（脚本） */
export interface PortSlotAllocator {
  allocate(request: {
    readonly playgroundId: string;
    readonly runner: string;
    /** 索引里已登记的全部端口，含找不到文件夹的项目 */
    readonly taken: ReadonlySet<number>;
  }): Promise<number | null>;
}

/** 来源里的一个文件：相对项目文件夹的路径和内容 */
export interface SeedFile {
  readonly path: PosixRelPath;
  readonly contents: string | Uint8Array;
}

/**
 * 接缝：创建一个项目需要的一切，由模板那一侧产出。资源库只认“相对路径加内容”和写进
 * playground.json 的那几项；模板格式、变量替换、模板登记表都不在本包。
 */
export interface PlaygroundSeed {
  readonly template: Playground["template"];
  readonly runner: string;
  readonly requires: Readonly<Record<string, string>>;
  /** 模板 requires 里的 install，原样存进 playground.json；没有就不给 */
  readonly requiresInstall?: PlaygroundFile["requiresInstall"];
  readonly toolchainAtCreate: Readonly<Record<string, string>>;
  readonly packageManager?: PlaygroundFile["packageManager"];
  readonly entry?: PlaygroundFile["entry"];
  readonly open?: PlaygroundFile["open"];
  readonly scriptAutoRun?: boolean;
  readonly files: Iterable<SeedFile> | AsyncIterable<SeedFile>;
}

export interface CreatePlaygroundRequest {
  /** 缺省取“模板标识加序号” */
  readonly name?: string;
  readonly note?: string;
  /** 给了就打开自动清理；缺省是“已保留” */
  readonly autoCleanDays?: number;
  /** 缺省 fail */
  readonly ifExists?: "reuse" | "fail";
  readonly createdBy: CreatedBy;
}

export interface CreatePlaygroundResult {
  readonly created: boolean;
  readonly name: string;
  readonly path: AbsPath;
  readonly entry: LibraryEntry;
  readonly file: PlaygroundFile;
  readonly retention: "kept" | "auto-clean";
  readonly notices: readonly Notice[];
}

/** 资源库里的一项：索引记录加文件夹名 */
export interface LibraryItem {
  readonly name: string;
  readonly entry: LibraryEntry;
}

export type ScanChange =
  /** 磁盘上有、索引里没有（重建索引或放进来的文件夹） */
  | { readonly kind: "added"; readonly id: string; readonly name: string; readonly path: AbsPath }
  /** 按 id 认回：改名、移动，或重新出现在原处 */
  | {
      readonly kind: "changed";
      readonly id: string;
      readonly name: string;
      readonly path: AbsPath;
      readonly reason: "renamed-or-moved" | "recovered";
    }
  | { readonly kind: "missing"; readonly id: string; readonly name: string; readonly path: AbsPath }
  /** 同 id 的多出来的一份：换了新 id 和新端口 */
  | {
      readonly kind: "copied";
      readonly oldId: string;
      readonly id: string;
      readonly name: string;
      readonly path: AbsPath;
    };

export interface ScanSkip {
  readonly path: AbsPath;
  /** corrupt：playground.json 坏了，跳过且不重写；newer：版本更新，认得但不改写 */
  readonly reason: "corrupt" | "newer";
}

export interface ScanReport {
  readonly changes: readonly ScanChange[];
  readonly skipped: readonly ScanSkip[];
}
