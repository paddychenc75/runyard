// 每个版本给负责人看的白话说明：docs/releases/<版本>.md（决策记录 0015，docs/guides/release.md）。
// 这个文件放在 main 上，不放在发版 PR 里，因为发版 PR 每次 main 有新提交都会被 release-please 重写。
//
// 用法（在仓库根目录）：
//   node tooling/ci/release-summary.ts check --version 0.1.0
//   node tooling/ci/release-summary.ts check --manifest .release-please-manifest.json
//   node tooling/ci/release-summary.ts compose --version 0.1.0 --body-file <更新日志正文>
// check：说明文件缺失或是空的就退出码 1；compose：把说明放在更新日志正文前面，打印到标准输出。

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const VERSION = /^\d+\.\d+\.\d+$/;

export function summaryPath(version: string): string {
  return `docs/releases/${version}.md`;
}

// 返回说明的正文；缺失、版本号格式不对、内容是空的就返回错误
export function readSummary(root: string, version: string): { text: string } | { error: string } {
  if (!VERSION.test(version))
    return { error: `版本号“${version}”格式不对，应该是 1.2.3 这样的写法。` };
  const path = summaryPath(version);
  const full = join(root, path);
  if (!existsSync(full)) {
    return {
      error: `还没有 ${version} 的白话说明 ${path}。先在一个普通 PR 里写好并合并（3 到 6 句话，格式见 docs/guides/release.md），再把发版 PR 交给负责人。`,
    };
  }
  const text = readFileSync(full, "utf8").trim();
  if (text === "") return { error: `${path} 是空的。按 docs/guides/release.md 写 3 到 6 句话。` };
  return { text };
}

// GitHub Release 的正文：先是白话说明，再是 release-please 生成的更新日志
export function composeReleaseNotes(summary: string, changelogBody: string): string {
  return `${summary.trim()}\n\n---\n\n${changelogBody.trim()}\n`;
}

function readManifestVersion(path: string): string {
  const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  return manifest["."] ?? "";
}

function parseArgs(argv: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let i = 1; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === undefined || value === undefined) throw new Error(`参数错误：${key ?? ""}`);
    values.set(key, value);
  }
  return values;
}

function main(): number {
  const argv = process.argv.slice(2);
  const command = argv[0];
  let args: Map<string, string>;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  const manifest = args.get("--manifest");
  const version = args.get("--version") ?? (manifest ? readManifestVersion(manifest) : "");
  if ((command !== "check" && command !== "compose") || version === "") {
    console.error("参数错误：命令是 check 或 compose，并且要给 --version 或 --manifest。");
    return 2;
  }
  const result = readSummary(".", version);
  if ("error" in result) {
    console.error(result.error);
    return 1;
  }
  if (command === "check") {
    console.log(`有 ${version} 的白话说明：${summaryPath(version)}`);
    return 0;
  }
  const bodyFile = args.get("--body-file");
  if (bodyFile === undefined) {
    console.error("参数错误：compose 要给 --body-file。");
    return 2;
  }
  process.stdout.write(composeReleaseNotes(result.text, readFileSync(bodyFile, "utf8")));
  return 0;
}

if (import.meta.main) process.exit(main());
