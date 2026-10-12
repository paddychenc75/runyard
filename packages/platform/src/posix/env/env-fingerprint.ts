import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AbsPath } from "../../path-types.ts";
import type { Env } from "../../platform.ts";
import type { ShellKind } from "./login-shell.ts";

// 缓存的键（技术设计 §4.8）：登录 shell 加启动文件 mtime 指纹；项目里有版本文件时再加项目路径和这些文件的 mtime。
// 只能发现“文件变了”；启动文件没变而 nvm 默认别名变了这类变化发现不了，靠 TTL 和“重新检测”。

/** 版本文件：垫片和 `--use-on-cd` 一类的工具按它们选版本 */
export const VERSION_FILES = [
  ".node-version",
  ".nvmrc",
  ".tool-versions",
  "mise.toml",
  ".python-version",
  "package.json",
] as const;

async function mtimeOf(file: string): Promise<string> {
  try {
    return String((await stat(file)).mtimeMs);
  } catch {
    return "-";
  }
}

function startupFiles(kind: ShellKind, home: AbsPath, base: Env): string[] {
  if (kind === "zsh") {
    const dir = base.ZDOTDIR ?? home;
    return [
      ...[".zshenv", ".zprofile", ".zshrc", ".zlogin"].map((name) => join(dir, name)),
      "/etc/zshenv",
      "/etc/zprofile",
      "/etc/zshrc",
      "/etc/zlogin",
    ];
  }
  if (kind === "bash") {
    return [
      ...[".bash_profile", ".bash_login", ".profile", ".bashrc"].map((name) => join(home, name)),
      "/etc/profile",
      "/etc/bashrc",
      "/etc/bash.bashrc",
    ];
  }
  const config = join(base.XDG_CONFIG_HOME ?? join(home, ".config"), "fish");
  return [join(config, "config.fish"), join(config, "conf.d"), "/etc/fish/config.fish"];
}

export async function startupFingerprint(
  shell: string,
  kind: ShellKind,
  home: AbsPath,
  base: Env,
): Promise<string> {
  const files = startupFiles(kind, home, base);
  const times = await Promise.all(files.map((file) => mtimeOf(file)));
  return [shell, ...files.map((file, i) => `${file}@${times[i]}`)].join("|");
}

/** 项目文件夹里的版本文件指纹；一个版本文件也没有返回 null（这样的项目共用全局缓存） */
export async function projectFingerprint(cwd: AbsPath): Promise<string | null> {
  let present: string[];
  try {
    const names = new Set(await readdir(cwd));
    present = VERSION_FILES.filter((name) => names.has(name));
  } catch {
    return null;
  }
  if (present.length === 0) return null;
  const times = await Promise.all(present.map((name) => mtimeOf(join(cwd, name))));
  return [cwd, ...present.map((name, i) => `${name}@${times[i]}`)].join("|");
}
