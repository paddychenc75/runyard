import type { Locale } from "@runyard/i18n";
import { type Settings, type SettingsPatch, settingsPatchSchema } from "@runyard/protocol";
import type { ExternalEditorOption, LibraryRootChoice } from "../shared/settings-bridge.ts";
import type { LibraryClient } from "./library-controller.ts";
import { displayPath } from "./library-root.ts";

// 设置页背后的逻辑（规格 desktop/settings）：读写管理进程的设置，把需要主进程动手的几项落实——
// 主题（系统外观）、语言（菜单和资源库文字）、资源库位置（重读项目），并把变化推给界面。
// 不认识 Electron：系统相关的动作经 SettingsHost 传进来，所以可以整个用假的测。

export interface SettingsHost {
  /** 让系统画的菜单、窗口外框和网页跟着明暗选择走 */
  setTheme(theme: Settings["theme"]): void;
  /** 本机找到的外部编辑器 */
  editors(): Promise<ExternalEditorOption[]>;
  /** 用这款编辑器打开文件夹；编辑器不在了返回 false */
  openInEditor(editorId: string, folder: string): boolean;
  /** 没选编辑器时用系统默认的方式打开 */
  openDefault(folder: string): void;
  /** 文件夹选择器；取消是 null */
  chooseFolder(defaultPath: string): Promise<string | null>;
  revealInFileManager(path: string): void;
  /** 路径是不是在“桌面”“文档”“下载”里 */
  isPrivacyProtected(path: string): boolean;
  /** 语言变了：重建应用菜单 */
  localeChanged(locale: Locale): void;
}

/** 控制器用到的资源库控制器的那一小部分 */
export interface SettingsLibrary {
  /** 语言或资源库位置变了：按新的重读并推给界面 */
  applySettings(locale: Locale): Promise<void>;
  folderOf(playgroundId: string): string | null;
}

export interface SettingsControllerOptions {
  client: Pick<LibraryClient, "call" | "subscribe">;
  host: SettingsHost;
  library: SettingsLibrary;
  home: string;
  /** 设置里没写语言时用的语言（启动参数或系统语言） */
  fallbackLocale: Locale;
  /** 设置里主题是“跟随系统”时用的明暗（启动参数 --theme，开发用）；没有就真的跟随系统 */
  fallbackTheme?: Settings["theme"];
  /** 启动时已经落实过的设置（主进程启动时读到的）；之后只落实相对它的变化 */
  initial?: Settings;
}

export class SettingsController {
  readonly #client: SettingsControllerOptions["client"];
  readonly #host: SettingsHost;
  readonly #library: SettingsLibrary;
  readonly #home: string;
  readonly #fallbackLocale: Locale;
  readonly #fallbackTheme: Settings["theme"];
  #last: Settings | undefined;
  readonly #listeners = new Set<(settings: Settings) => void>();

  constructor(options: SettingsControllerOptions) {
    this.#client = options.client;
    this.#host = options.host;
    this.#library = options.library;
    this.#home = options.home;
    this.#fallbackLocale = options.fallbackLocale;
    this.#fallbackTheme = options.fallbackTheme ?? "system";
    this.#last = options.initial;
  }

  /** 读第一份设置并订阅变化（命令行或别处改了设置，开着的设置页要跟着更新） */
  async start(): Promise<void> {
    try {
      await this.#client.subscribe(["settings"], () => void this.#reread());
    } catch {
      // 订阅不上就只在本应用里改的时候更新
    }
    await this.#reread();
  }

  /** 设置里选的语言；没选就是启动时定下的语言 */
  localeOf(settings: Settings): Locale {
    return settings.language ?? this.#fallbackLocale;
  }

  themeOf(settings: Settings): Settings["theme"] {
    return settings.theme === "system" ? this.#fallbackTheme : settings.theme;
  }

  async get(): Promise<Settings> {
    return await this.#client.call("settings.get", {});
  }

  /** 改设置：界面发来的内容不可信，形状不对就不改，原样返回当前设置 */
  async set(patch: unknown): Promise<Settings> {
    const parsed = settingsPatchSchema.safeParse(patch);
    if (!parsed.success) return await this.get();
    const next = await this.#client.call("settings.set", parsed.data satisfies SettingsPatch);
    await this.#publish(next);
    return next;
  }

  onChange(listener: (settings: Settings) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  editors(): Promise<ExternalEditorOption[]> {
    return this.#host.editors();
  }

  /** 弹出文件夹选择器；返回选中的位置和它要不要先警告 */
  async pickLibraryRoot(): Promise<LibraryRootChoice | null> {
    const current = await this.get();
    const path = await this.#host.chooseFolder(current.libraryRoot);
    if (path === null) return null;
    return {
      path,
      display: displayPath(path, this.#home),
      protectedFolder: this.#host.isPrivacyProtected(path),
    };
  }

  async revealLibraryRoot(): Promise<void> {
    this.#host.revealInFileManager((await this.get()).libraryRoot);
  }

  /** 用设置里选的编辑器打开项目文件夹（规格 DESKTOP-SETTINGS-07）；选的编辑器找不到就用系统默认的方式 */
  async openInEditor(playgroundId: string): Promise<void> {
    const folder = this.#library.folderOf(playgroundId);
    if (folder === null) return;
    const { externalEditor } = await this.get();
    // 没选过就用本机找到的第一款（存储里写的是“自动探测”）
    const editor = externalEditor ?? (await this.#host.editors())[0]?.id;
    if (editor === undefined || !this.#host.openInEditor(editor, folder)) {
      this.#host.openDefault(folder);
    }
  }

  async #reread(): Promise<void> {
    try {
      await this.#publish(await this.#client.call("settings.get", {}));
    } catch {
      // 管理进程不在：保持现状
    }
  }

  // 有变化才落实和推送；落实时只做变了的那几项
  async #publish(next: Settings): Promise<void> {
    const before = this.#last;
    if (before !== undefined && JSON.stringify(before) === JSON.stringify(next)) return;
    this.#last = next;
    if (before === undefined || this.themeOf(before) !== this.themeOf(next)) {
      this.#host.setTheme(this.themeOf(next));
    }
    const localeChanged = before === undefined || this.localeOf(before) !== this.localeOf(next);
    if (localeChanged || before.libraryRoot !== next.libraryRoot) {
      await this.#library.applySettings(this.localeOf(next));
    }
    if (localeChanged) this.#host.localeChanged(this.localeOf(next));
    for (const listener of this.#listeners) listener(next);
  }
}
