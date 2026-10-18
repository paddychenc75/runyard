import type { FileChange } from "../../../shared/editor-files.ts";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { NODE_GLOBALS_PATH, NODE_GLOBALS_SOURCE } from "./node-globals.ts";
import { isScriptPath, type ProjectSource, READ_PARALLEL } from "./project-source.ts";

// 项目文件进语言服务（规格 DESKTOP-EDITOR-40、41、44；K8 证据“装法”第 7 条）：
// 没打开的脚本登记成 extra lib（只是文本，语言服务按需解析），只给打开的文件建模型。
// 500 个文件的项目全建模型第一次补全要等 26 到 32 秒，这样是 254 毫秒。
// 打开的文件不在 extra lib 里（模型是它的内容）；关闭后用最后的内容回到 extra lib。
// 同一个路径的 extra lib 和模型版本号各数各的，撞上就会拿到旧类型，所以每次换手都要把新一方的版本号抬过旧一方。

const FLUSH_DELAY_MS = 150;

export function fileUriOf(path: string): string {
  return `file:///${path}`;
}

const MAX_VERSION_BUMPS = 500;

/** 刚关掉的文件：最后的内容和模型最后的版本号 */
export interface ClosedFile {
  text: string;
  version: number;
}

export interface TypeScriptProjectOptions {
  runtime: EditorRuntime;
  source: ProjectSource;
  /** 登记的文件集变了（界面据此重新检查打开的文件，DESKTOP-EDITOR-44） */
  onLibsChanged(): void;
  /** 测试里可以调短 */
  flushDelayMs?: number;
}

export class TypeScriptProject {
  readonly #runtime: EditorRuntime;
  readonly #source: ProjectSource;
  readonly #onLibsChanged: () => void;
  readonly #delay: number;
  /** 项目里每个脚本的最新内容：磁盘上的，或者关闭时编辑器里的 */
  readonly #known = new Map<string, string>();
  readonly #open = new Set<string>();
  /** 此刻登记在语言服务里的 */
  #pushed = new Map<string, string>();
  /** 刚关掉的文件，模型最后的版本号：回到 extra lib 的版本号必须比它大 */
  readonly #versionFloor = new Map<string, number>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #stopWatching: (() => void) | undefined;
  #disposed = false;
  /** 内置的 Node 全局声明是否已交给语言服务（没有任何项目脚本时第一次 flush 也要交） */
  #builtinPushed = false;
  #loaded: Promise<void> = Promise.resolve();

  constructor(options: TypeScriptProjectOptions) {
    this.#runtime = options.runtime;
    this.#source = options.source;
    this.#onLibsChanged = options.onLibsChanged;
    this.#delay = options.flushDelayMs ?? FLUSH_DELAY_MS;
  }

  /** 读完整个项目并开始听磁盘变化；先监听再读，读之后发生的变化不会漏 */
  start(): Promise<void> {
    this.#stopWatching = this.#source.watch((changes) => void this.#onDisk(changes));
    this.#loaded = this.#load();
    return this.#loaded;
  }

  async #load(): Promise<void> {
    const paths = await this.#source.listScripts();
    for (let i = 0; i < paths.length && !this.#disposed; i += READ_PARALLEL) {
      await Promise.all(
        paths.slice(i, i + READ_PARALLEL).map(async (path) => {
          const text = await this.#source.read(path);
          // 读的过程中已经有更新的（关闭时的内容、监听到的变化）就不盖
          if (text !== null && !this.#known.has(path) && !this.#open.has(path)) {
            this.#known.set(path, text);
          }
        }),
      );
    }
    this.flush();
  }

  async #onDisk(changes: FileChange[]): Promise<void> {
    await this.#loaded;
    let touched = false;
    await Promise.all(
      changes.map(async (change) => {
        if (!isScriptPath(change.path) || this.#open.has(change.path)) return;
        if (change.kind === "remove") {
          touched = this.#known.delete(change.path) || touched;
          return;
        }
        const text = await this.#source.read(change.path);
        if (this.#disposed || this.#open.has(change.path)) return;
        if (text === null) touched = this.#known.delete(change.path) || touched;
        else if (this.#known.get(change.path) !== text) {
          this.#known.set(change.path, text);
          touched = true;
        }
      }),
    );
    if (touched) this.schedule();
  }

  /** 编辑器告知此刻打开着的文件；刚关掉的文件用 textOf 给的最后内容回到 extra lib */
  setOpen(open: ReadonlySet<string>, closed: ReadonlyMap<string, ClosedFile>): void {
    let changed = false;
    for (const path of [...this.#open]) {
      if (open.has(path)) continue;
      this.#open.delete(path);
      const file = closed.get(path);
      if (file !== undefined) {
        this.#known.set(path, file.text);
        this.#versionFloor.set(path, file.version);
      }
      changed = true;
    }
    for (const path of open) {
      if (this.#open.has(path)) continue;
      this.#open.add(path);
      changed = true;
    }
    if (changed) this.schedule();
  }

  /** 此刻在语言服务里登记着的 extra lib 的版本号；没登记是 undefined */
  libVersion(path: string): number | undefined {
    return this.#runtime.typescript.typescriptDefaults.getExtraLibs()[fileUriOf(path)]?.version;
  }

  isKnownScript(path: string): boolean {
    return this.#known.has(path) || this.#open.has(path);
  }

  /** 合并短时间内的多次变化，再一次交给语言服务 */
  schedule(): void {
    if (this.#disposed || this.#timer !== undefined) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.flush();
    }, this.#delay);
  }

  /** 马上把当前的项目文件集交给语言服务（没变化就什么都不做） */
  flush(): void {
    if (this.#disposed) return;
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    const next = new Map<string, string>();
    for (const [path, text] of this.#known) if (!this.#open.has(path)) next.set(path, text);
    const same =
      this.#builtinPushed &&
      next.size === this.#pushed.size &&
      [...next].every(([path, text]) => this.#pushed.get(path) === text);
    if (same) return;
    const { typescriptDefaults, javascriptDefaults } = this.#runtime.typescript;
    const libs = [
      { content: NODE_GLOBALS_SOURCE, filePath: NODE_GLOBALS_PATH },
      ...[...next].map(([path, text]) => ({ content: text, filePath: fileUriOf(path) })),
    ];
    this.#builtinPushed = true;
    typescriptDefaults.setExtraLibs(libs);
    javascriptDefaults.setExtraLibs(libs);
    // 每次 setExtraLibs 都让所有库的版本号加一；刚关掉的文件要超过它做模型时的最后版本，
    // 否则语言服务缓存里同一个路径同一个版本号的旧内容会被当成没变（K8 的“旧类型”陷阱）
    for (const [path, floor] of this.#versionFloor) {
      if (!next.has(path)) continue;
      for (
        let guard = 0;
        (this.libVersion(path) ?? 0) <= floor && guard < MAX_VERSION_BUMPS;
        guard++
      ) {
        typescriptDefaults.setExtraLibs(libs);
        javascriptDefaults.setExtraLibs(libs);
      }
    }
    this.#versionFloor.clear();
    this.#pushed = next;
    this.#onLibsChanged();
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#stopWatching?.();
    const { typescriptDefaults, javascriptDefaults } = this.#runtime.typescript;
    typescriptDefaults.setExtraLibs([]);
    javascriptDefaults.setExtraLibs([]);
  }

  /** 登记在册的路径（给清理自动生成的模型用） */
  get registered(): ReadonlyMap<string, string> {
    return this.#pushed;
  }
}
