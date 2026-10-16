import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { absPath, discoveryFilePath, getPlatform, type Platform } from "@runyard/platform";
import { registerSpawned } from "@runyard/testing";
import { afterEach, describe, expect, it } from "vitest";
import { createDeps, developmentConfig } from "./composition-root.ts";

// 缺陷 #152 的真实进程回归：真管理进程 + 真登录 shell + 需要 node 的模板，从 new 到运行结束。
// 管理进程的环境是空的（和从访达启动一样），node 只能经登录 shell 读到：这里用一个合成的“用户主目录”，
// 它的启动文件把 node 所在目录放进 PATH。数据根目录（--root）是另一个目录。绝不碰真实的启动文件、~/Runyard、~/.runyard。

const ENTRY = fileURLToPath(new URL("./main.ts", import.meta.url));
const dirs: string[] = [];

function shortDir(prefix: string): string {
  // 短前缀：管理进程的连接点路径有长度上限（104 字节）
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    // delete-allow: 测试自己建的临时目录，不是用户的内容
    rmSync(dir, { recursive: true, force: true });
  }
});

async function collect(stream: AsyncIterable<unknown>): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += String(chunk);
  return text;
}

// 启动文件各 shell 的写法都放一份：zsh 读 .zshrc，bash 读 .bash_profile / .profile
function writeStartupFiles(accountHome: string, nodeDir: string): void {
  const line = `export PATH="${nodeDir}:$PATH"\n`;
  mkdirSync(accountHome, { recursive: true });
  for (const name of [".zshrc", ".bashrc", ".profile"])
    writeFileSync(join(accountHome, name), line);
  writeFileSync(join(accountHome, ".bash_profile"), `. "$HOME/.bashrc"\n`);
}

async function runEntry(root: string, accountHome: string, args: string[]) {
  const platform = getPlatform({ home: absPath(root), profile: undefined });
  const child = platform.exec.spawn({
    argv: [process.execPath, ENTRY, "--root", root, ...args],
    cwd: absPath(root),
    // 命令行进程自己的 PATH 上没有 node 之外的东西；HOME 指向合成的用户主目录
    env: { PATH: "/usr/bin:/bin", HOME: accountHome },
    stdin: false,
  });
  registerSpawned(platform, child.ref);
  const [stdout, stderr, exit] = await Promise.all([
    collect(child.stdout),
    collect(child.stderr),
    child.exited,
  ]);
  return { stdout, stderr, code: exit.exitCode };
}

// 等管理进程真的退出，按 pid 加启动时间认它，不按名字
async function stopSupervisor(platform: Platform): Promise<void> {
  const file = await platform.fs.readText(discoveryFilePath(platform.paths.stateDir));
  if (file === null) return;
  const pid = (JSON.parse(file) as { pid: number }).pid;
  const identity = await platform.proc.identity(pid);
  if (identity === null) return;
  registerSpawned(platform, { pid, startTime: identity.startTime });
  const client = await createDeps(developmentConfig()).connect(platform);
  await client.call("supervisor.shutdown", { ifIdle: false, reason: "user" });
  client.close();
  const deadline = Date.now() + 15_000;
  for (;;) {
    const now = await platform.proc.identity(pid);
    if (now === null || now.startTime !== identity.startTime) return;
    if (Date.now() > deadline) throw new Error("supervisor process did not exit");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("需要工具的模板连着真的管理进程", () => {
  it("[TOOLCHAIN-DETECTION-13] node-ts 模板：数据根目录不是用户主目录，管理进程仍经登录 shell 找到 node，运行到结束", async () => {
    const root = shortDir("ry-tl-");
    const accountHome = shortDir("ry-ah-");
    writeStartupFiles(accountHome, dirname(process.execPath));
    const platform = getPlatform({ home: absPath(root), profile: undefined });
    try {
      const created = await runEntry(root, accountHome, ["new", "node-ts", "hello", "--json"]);
      expect(created.code).toBe(0);

      const ran = await runEntry(root, accountHome, ["run", "hello", "--json"]);
      expect(ran.stderr).not.toContain("TOOL_MISSING");
      expect(ran.code).toBe(0);
      expect(JSON.parse(ran.stdout)).toMatchObject({
        state: "finished",
        exitCode: 0,
        output: "Hello, Runyard!\n",
      });
    } finally {
      await stopSupervisor(platform);
    }
  }, 90_000);
});
