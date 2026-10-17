import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { absPath, getPlatform } from "@runyard/platform";
import { afterEach, describe, expect, it } from "vitest";

// 启动脚本 bin/runyard：PATH 上是指向它的符号链接（甚至链接套链接），它要找到应用里的可执行文件，
// 带上 ELECTRON_RUN_AS_NODE 去运行同一棵树里的 runyard/cli.mjs，并原样转交参数。
// 这里用一个假的“应用”：MacOS/Runyard 只是把收到的东西打印出来。

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    // delete-allow: 测试自己建的临时目录
    rmSync(dir, { recursive: true, force: true });
  }
});

function fakeApp(): { root: string; launcher: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ry-launch-")));
  dirs.push(root);
  const contents = join(root, "Runyard.app", "Contents");
  mkdirSync(join(contents, "MacOS"), { recursive: true });
  mkdirSync(join(contents, "Resources", "bin"), { recursive: true });
  const exe = join(contents, "MacOS", "Runyard");
  writeFileSync(exe, '#!/bin/sh\nprintf "%s\\n" "node=$ELECTRON_RUN_AS_NODE" "$@"\n');
  chmodSync(exe, 0o755);
  const launcher = join(contents, "Resources", "bin", "runyard");
  copyFileSync(join(import.meta.dirname, "bin", "runyard"), launcher);
  chmodSync(launcher, 0o755);
  return { root, launcher };
}

// 经平台层启动（产品之外的测试同样不直接用 child_process）；环境里去掉了 ELECTRON_RUN_AS_NODE，由脚本自己加回来
async function run(file: string, args: string[]): Promise<string> {
  const proc = getPlatform().exec.spawn({
    argv: [file, ...args],
    cwd: absPath(tmpdir()),
    env: { PATH: "/usr/bin:/bin" },
    stdin: false,
  });
  let out = "";
  proc.stdout.on("data", (chunk) => {
    out += String(chunk);
  });
  await proc.exited;
  return out;
}

describe("bin/runyard 启动脚本", () => {
  it("直接运行：以 ELECTRON_RUN_AS_NODE 执行 cli.mjs 并原样转交参数（含空格）", async () => {
    const { launcher } = fakeApp();
    const out = await run(launcher, ["new", "html", "my demo"]);
    const lines = out.trim().split("\n");
    expect(lines[0]).toBe("node=1");
    expect(lines[1]).toMatch(/\/Contents\/Resources\/runyard\/cli\.mjs$/);
    expect(lines.slice(2)).toEqual(["new", "html", "my demo"]);
  });

  it("经链接的链接运行（PATH 里的链接再指向别的链接）也能找到应用", async () => {
    const { root, launcher } = fakeApp();
    mkdirSync(join(root, "bin"));
    symlinkSync(launcher, join(root, "bin", "inner"));
    symlinkSync("inner", join(root, "bin", "runyard"));
    const out = await run(join(root, "bin", "runyard"), ["--version"]);
    expect(out).toContain("/Runyard.app/Contents/Resources/runyard/cli.mjs");
    expect(out.trim().split("\n").at(-1)).toBe("--version");
  });
});
