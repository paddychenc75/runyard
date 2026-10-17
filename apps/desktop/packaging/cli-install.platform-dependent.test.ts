import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { absPath, discoveryFilePath, getPlatform } from "@runyard/platform";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cliLauncherPath,
  defaultCliBinDir,
  installCliLink,
} from "../src/main/integration/cli-link.ts";
import { buildRuntimeBundle, type RuntimeManifest } from "./runtime-bundle.ts";

// 随应用安装的命令行，从链接到执行走一遍真的：打出运行时、放进一个假的 .app（可执行文件就是 Node）、
// 在临时主目录里装链接，再经链接运行命令（规格 CLI-COMMANDS-80、81）。
// 管理进程是命令行拉起来的，结束时按 pid 加启动时间停掉；主目录在 /tmp 下（连接点的路径有长度上限），绝不碰 ~/.runyard。

const VERSION = "9.8.7";
const root = realpathSync(mkdtempSync("/tmp/ry-cli-"));
const home = join(root, "home");
const resources = join(root, "Runyard.app", "Contents", "Resources");
let manifest: RuntimeManifest;

beforeAll(async () => {
  mkdirSync(home, { recursive: true });
  mkdirSync(join(root, "Runyard.app", "Contents", "MacOS"), { recursive: true });
  manifest = await buildRuntimeBundle({
    repoRoot: join(import.meta.dirname, "..", "..", ".."),
    outDir: resources,
    version: VERSION,
    buildSuffix: "cafe0001",
  });
  // 假的应用可执行文件：启动脚本用它当 Node 运行 cli.mjs
  const exe = join(root, "Runyard.app", "Contents", "MacOS", "Runyard");
  writeFileSync(exe, `#!/bin/sh\nexec "${process.execPath}" "$@"\n`);
  chmodSync(exe, 0o755);
});

const platform = getPlatform({ home: absPath(home) });

afterAll(async () => {
  // 停掉命令行拉起来的管理进程：发现文件里有 pid 和启动时间
  try {
    const file = JSON.parse(readFileSync(discoveryFilePath(platform.paths.stateDir), "utf8")) as {
      pid: number;
      processStart?: number;
    };
    const identity = await platform.proc.identity(file.pid);
    if (identity !== null) {
      await platform.proc.terminate(
        { pid: file.pid, startTime: identity.startTime },
        { mode: "kill", graceMs: 0 },
      );
    }
  } catch {
    // 没起过管理进程
  }
  // delete-allow: 测试自己建的临时目录
  rmSync(root, { recursive: true, force: true });
});

async function run(file: string, args: string[]): Promise<{ code: number | null; out: string }> {
  const proc = platform.exec.spawn({
    argv: [file, ...args],
    cwd: absPath(home),
    env: { HOME: home, PATH: "/usr/bin:/bin" },
    stdin: false,
  });
  let out = "";
  proc.stdout.on("data", (chunk) => {
    out += String(chunk);
  });
  const exit = await proc.exited;
  return { code: exit.exitCode, out };
}

const link = () => join(defaultCliBinDir(home), "runyard");

describe("随应用安装的命令行", () => {
  it("[CLI-COMMANDS-81] ~/.local/bin 不存在时建出链接指向应用里的启动脚本；经它执行 runyard new html demo --run 成功", async () => {
    const launcher = cliLauncherPath(resources);
    const installed = await installCliLink(defaultCliBinDir(home), launcher);
    expect(installed.status).toBe("installed");
    const { code, out } = await run(link(), ["new", "html", "demo", "--run", "--json"]);
    expect(code).toBe(0);
    expect(JSON.parse(out)).toMatchObject({ name: "demo" });
  });

  it("[CLI-COMMANDS-80] 经链接执行 runyard doctor --json：版本与应用相同，cli.kind 是 app，管理进程的构建标识与应用清单相同", async () => {
    const { code, out } = await run(link(), ["doctor", "--json"]);
    expect(code).toBe(0);
    const report = JSON.parse(out) as {
      cli: { version: string; kind: string };
      supervisor: { build?: string; version?: string };
    };
    expect(report.cli).toMatchObject({ version: VERSION, kind: "app" });
    expect(report.supervisor).toMatchObject({ version: VERSION, build: manifest.build });
  });
});
