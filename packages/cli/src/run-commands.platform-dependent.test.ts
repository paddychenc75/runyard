import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { absPath, discoveryFilePath, getPlatform, type Platform } from "@runyard/platform";
import { registerSpawned } from "@runyard/testing";
import { afterEach, describe, expect, it } from "vitest";
import { createDeps, developmentConfig } from "./composition-root.ts";

// stop / status / logs / rm 连着真的管理进程（临时主目录里的真进程），验证命令行说的话和管理进程
// 真的对得上：方法名、参数、返回值的形状都由协议登记表校验过，这里只看端到端的结果。
// 假的管理进程在 commands/*.test.ts。一律用 --root 指向 mktemp 目录，不碰真实的 ~/Runyard 和 ~/.runyard。

const ENTRY = fileURLToPath(new URL("./main.ts", import.meta.url));
const dirs: string[] = [];

function tempHome() {
  // 短前缀：管理进程的连接点路径有长度上限
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ry-cli-")));
  dirs.push(dir);
  return absPath(dir);
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

async function runEntry(home: ReturnType<typeof tempHome>, args: string[]) {
  const platform = getPlatform({ home, profile: undefined });
  const child = platform.exec.spawn({
    argv: [process.execPath, ENTRY, "--root", home, ...args],
    cwd: home,
    env: { PATH: process.env.PATH ?? "" },
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

// 资源库里放一个已有的项目文件夹：管理进程启动时的扫描会登记它
function seedPlayground(home: string, name: string, id: string): string {
  const dir = join(home, "Runyard", name);
  mkdirSync(join(dir, ".runyard"), { recursive: true });
  writeFileSync(join(dir, "index.js"), "console.log(1)\n");
  writeFileSync(
    join(dir, ".runyard", "playground.json"),
    JSON.stringify({
      formatVersion: 1,
      id,
      template: { id: "html", source: "builtin", appVersion: "0.0.0" },
      runner: "static",
      requires: {},
      toolchainAtCreate: {},
      createdAt: 1,
      createdBy: { kind: "user" },
      autoClean: { enabled: false },
      trust: "trusted",
    }),
  );
  return dir;
}

// 等管理进程真的退出：先看进程本身消失（守卫不会把它当遗留）
async function stopSupervisor(
  platform: Platform,
  client: Awaited<ReturnType<ReturnType<typeof createDeps>["connect"]>>,
): Promise<void> {
  const file = await platform.fs.readText(discoveryFilePath(platform.paths.stateDir));
  const pid = (JSON.parse(file ?? "{}") as { pid: number }).pid;
  const identity = await platform.proc.identity(pid);
  if (identity !== null) registerSpawned(platform, { pid, startTime: identity.startTime });
  await client.call("supervisor.shutdown", { ifIdle: false, reason: "user" });
  client.close();
  const deadline = Date.now() + 15_000;
  for (;;) {
    const now = await platform.proc.identity(pid);
    if (now === null || now.startTime !== identity?.startTime) return;
    if (Date.now() > deadline) throw new Error("supervisor process did not exit");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("stop status logs rm 连着真的管理进程", () => {
  it("status 列出资源库里的项目；没运行过时 stop 返回空、logs 返回空；rm 之后项目不在资源库里", async () => {
    const home = tempHome();
    const project = seedPlayground(home, "demo", "01DEMO");
    const platform: Platform = getPlatform({ home, profile: undefined });
    // 先拉起管理进程并等它扫描完，命令行的第一条命令才不会赶在登记之前
    const client = await createDeps(developmentConfig()).connect(platform);
    try {
      await client.call("library.rescan", {});

      const status = await runEntry(home, ["status", "--json"]);
      expect(status.code).toBe(0);
      const listed = JSON.parse(status.stdout) as {
        running: number;
        playgrounds: Record<string, unknown>[];
      };
      expect(listed.running).toBe(0);
      expect(listed.playgrounds).toHaveLength(1);
      expect(listed.playgrounds[0]).toMatchObject({
        id: "01DEMO",
        name: "demo",
        path: project,
        template: "html",
        state: "stopped",
        owner: null,
        url: null,
        retention: "kept",
        missing: false,
      });

      const stopped = await runEntry(home, ["stop", "demo", "--json"]);
      expect(stopped.code).toBe(0);
      expect(JSON.parse(stopped.stdout)).toEqual({ stopped: [] });
      const all = await runEntry(home, ["stop", "--all", "--mine", "--json"]);
      expect(JSON.parse(all.stdout)).toEqual({ stopped: [] });

      const logs = await runEntry(home, ["logs", "demo", "--json"]);
      expect(JSON.parse(logs.stdout)).toEqual({
        text: "",
        lines: 0,
        cursor: null,
        state: null,
        truncated: false,
      });

      const missing = await runEntry(home, ["rm", "nope", "--json"]);
      expect(missing.code).toBe(3);

      // rm 的两种结局都不许丢文件：macOS 上进废纸篓（0），不支持废纸篓的系统报 NOT_SUPPORTED（10）、文件夹原样
      const removed = await runEntry(home, ["rm", "demo", "--json"]);
      expect([0, 10]).toContain(removed.code);
      if (removed.code === 0) {
        expect(JSON.parse(removed.stdout)).toEqual({ name: "demo", path: project, trashed: true });
        expect(existsSync(project)).toBe(false);
        expect(readdirSync(join(home, ".Trash")).some((name) => name.startsWith("demo"))).toBe(
          true,
        );
        const after = await runEntry(home, ["status", "--json"]);
        expect((JSON.parse(after.stdout) as { playgrounds: unknown[] }).playgrounds).toEqual([]);
      } else {
        expect(existsSync(join(project, "index.js"))).toBe(true);
      }
    } finally {
      await stopSupervisor(platform, client);
    }
  }, 60_000);
});
