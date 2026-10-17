import type { ToolchainReport } from "@runyard/protocol";
import type { LocalNetwork, PickToolPathResult } from "../shared/settings-bridge.ts";
import type { LibraryClient } from "./library-controller.ts";

// 设置页“依赖与网络”“运行环境”背后的主进程一侧（规格 DESKTOP-SETTINGS-12 至 19）：
// 本机的镜像源和代理、运行环境表的检测、手动指定路径、在终端里运行安装命令。
// 不认识 Electron：文件选择器、终端经 ToolchainHost 传进来。

export interface ToolchainHost {
  /** 选一个可执行文件；取消是 null */
  chooseExecutable(): Promise<string | null>;
  /** 在系统终端里运行这一行（用户点了“在终端中运行”）；调用前已核对它就是检测结果里报告的安装命令 */
  runInTerminal(command: string): void;
  /** ~/.npmrc 的内容；没有是 null */
  readNpmrc(): Promise<string | null>;
}

/** .npmrc 里的一行 `key=value`：忽略注释和空行，值两边的引号去掉 */
function npmrcValue(text: string, key: string): string | undefined {
  let found: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const at = line.indexOf("=");
    if (at < 0 || line.slice(0, at).trim() !== key) continue;
    const value = line
      .slice(at + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
    if (value !== "") found = value;
  }
  return found;
}

/** 读出本机配置里的镜像源和代理；只认写得出地址的（模板化的 ${VAR} 之类不算） */
export function parseNpmrc(text: string | null): LocalNetwork {
  if (text === null) return {};
  const usable = (value: string | undefined) =>
    value !== undefined && /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(value) ? value : undefined;
  const registry = usable(npmrcValue(text, "registry"));
  const proxy = usable(npmrcValue(text, "https-proxy") ?? npmrcValue(text, "proxy"));
  return {
    ...(registry === undefined ? {} : { registry }),
    ...(proxy === undefined ? {} : { proxy }),
  };
}

export class ToolchainSettings {
  readonly #client: Pick<LibraryClient, "call" | "subscribe">;
  readonly #host: ToolchainHost;
  /** 上一次检测结果里各工具的安装命令：“在终端中运行”只认这里面的 */
  #installCommands = new Map<string, string>();
  readonly #listeners = new Set<() => void>();

  constructor(client: Pick<LibraryClient, "call" | "subscribe">, host: ToolchainHost) {
    this.#client = client;
    this.#host = host;
  }

  /** 订阅后台检测完成（管理进程发 toolchain.changed）；订阅不上就只在本应用里改的时候更新 */
  async start(): Promise<void> {
    try {
      await this.#client.subscribe(["toolchain"], () => this.#emit());
    } catch {
      // 管理进程不在
    }
  }

  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async localNetwork(): Promise<LocalNetwork> {
    try {
      return parseNpmrc(await this.#host.readNpmrc());
    } catch {
      return {};
    }
  }

  async check(cachedOnly: boolean): Promise<ToolchainReport> {
    return this.#remember(await this.#client.call("toolchain.check", { cachedOnly }));
  }

  async recheck(): Promise<ToolchainReport> {
    return this.#remember(await this.#client.call("toolchain.recheck", {}));
  }

  /** “指定路径…”：弹选择器，交给管理进程验证；不是可用的工具时原来的路径不变（规格 DESKTOP-SETTINGS-18） */
  async pickPath(tool: string): Promise<PickToolPathResult> {
    const path = await this.#host.chooseExecutable();
    if (path === null) return { status: "cancelled" };
    try {
      const report = await this.#client.call("toolchain.setPath", { tool, path });
      return { status: "set", report: this.#remember(report) };
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      return code === "TOOL_PATH_INVALID"
        ? { status: "invalid", tool, path }
        : { status: "failed" };
    }
  }

  runInstall(tool: string): void {
    const command = this.#installCommands.get(tool);
    if (command !== undefined) this.#host.runInTerminal(command);
  }

  #remember(report: ToolchainReport): ToolchainReport {
    for (const check of report.tools) {
      if (check.installCommand === undefined) this.#installCommands.delete(check.tool);
      else this.#installCommands.set(check.tool, check.installCommand);
    }
    return report;
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}
