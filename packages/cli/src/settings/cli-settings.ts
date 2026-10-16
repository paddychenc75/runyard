import { type AbsPath, joinPath, type Platform, posixRelPath } from "@runyard/platform";
import {
  CLI_FILE_VERSION,
  type CliFile,
  type CliLocale,
  cliFileFormat,
  quarantineFileName,
  readVersionedText,
  serializeVersioned,
} from "@runyard/protocol";
import { cliError } from "../cli-error.ts";

// ~/.runyard/cli.json 的读写（技术设计 §4.2）。命令行自己读写它，不经管理进程，
// 所以 --help 和 config 在管理进程没有运行时也能用。只有 `config set lang` 会写；
// --lang 和 RUNYARD_LANG 永远不写（规格 CLI-COMMANDS-16）。

export type CliSettingsState =
  | { status: "missing" }
  | { status: "ok"; file: CliFile }
  // 更新版本的 Runyard 写的：只读不写（读不出内容，当作没有设置）
  | { status: "newer"; found: number; supported: number }
  // 解析失败：写之前先改名留存
  | { status: "corrupt" };

export class CliSettings {
  readonly #platform: Platform;
  readonly #now: () => number;
  readonly #path: AbsPath;

  constructor(platform: Platform, now: () => number) {
    this.#platform = platform;
    this.#now = now;
    this.#path = joinPath(platform.paths.stateDir, posixRelPath(cliFileFormat.name));
  }

  async read(): Promise<CliSettingsState> {
    const text = await this.#platform.fs.readText(this.#path);
    if (text === null) return { status: "missing" };
    const result = readVersionedText(cliFileFormat, text);
    if (result.status === "ok") return { status: "ok", file: result.value };
    if (result.status === "newer") {
      return { status: "newer", found: result.fileVersion, supported: result.supportedVersion };
    }
    return { status: "corrupt" };
  }

  /** 已保存的语言值；文件缺失、损坏或来自更新版本时是 undefined */
  async savedLang(): Promise<string | undefined> {
    try {
      const state = await this.read();
      return state.status === "ok" ? state.file.lang : undefined;
    } catch {
      // 读不了设置文件不应让所有命令失败：语言退回默认，config set 会把真正的错误报出来
      return undefined;
    }
  }

  async setLang(lang: CliLocale): Promise<void> {
    const state = await this.read();
    if (state.status === "newer") {
      throw cliError("DATA_FROM_NEWER_VERSION", {
        file: "cli.json",
        found: state.found,
        supported: state.supported,
      });
    }
    if (state.status === "corrupt") {
      const kept = joinPath(
        this.#platform.paths.stateDir,
        posixRelPath(quarantineFileName(cliFileFormat.name, this.#now())),
      );
      await this.#platform.fs.renameFile(this.#path, kept);
    }
    const base = state.status === "ok" ? state.file : { formatVersion: CLI_FILE_VERSION as 1 };
    await this.#platform.fs.makeDir(this.#platform.paths.stateDir);
    await this.#platform.fs.writeAtomic(
      this.#path,
      serializeVersioned(cliFileFormat, { ...base, lang }),
    );
  }
}
