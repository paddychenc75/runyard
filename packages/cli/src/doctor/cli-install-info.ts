import { delimiter, isAbsolute } from "node:path";
import { absPath, joinPath, type Platform, posixRelPath } from "@runyard/platform";
import type { CliHost } from "../cli-deps.ts";

// doctor 的 cli 一项：这一份命令行是哪种安装，PATH 上还有没有另一种（规格 CLI-COMMANDS-67）。
// 两种安装并存时，用户在终端里敲的 runyard 是哪一份取决于 PATH 的顺序，这是最常见的“版本对不上”的原因。

export interface OtherInstall {
  readonly kind: "app" | "source";
  readonly version: string | null;
  readonly path: string;
}

export interface CliInstallInfo {
  readonly version: string;
  readonly kind: "app" | "source";
  readonly path: string;
  readonly other: OtherInstall | null;
}

async function pathCandidates(platform: Platform, pathVar: string | undefined): Promise<string[]> {
  const found: string[] = [];
  for (const dir of (pathVar ?? "").split(delimiter)) {
    if (!isAbsolute(dir)) continue;
    const candidate = joinPath(absPath(dir), posixRelPath("runyard"));
    if (await platform.fs.exists(candidate)) found.push(candidate);
  }
  return found;
}

export async function cliInstallInfo(
  platform: Platform,
  host: CliHost,
  env: Readonly<Record<string, string>>,
): Promise<CliInstallInfo> {
  const { install } = host;
  let other: OtherInstall | null = null;
  for (const path of await pathCandidates(platform, env.PATH)) {
    if (path === install.path) continue;
    const probed = await host.probeInstall(path);
    // 同一种安装的另一个入口不算“另一种”
    if (probed.kind === install.kind) continue;
    other = { kind: probed.kind, version: probed.version, path };
    break;
  }
  return { version: install.version, kind: install.kind, path: install.path, other };
}
