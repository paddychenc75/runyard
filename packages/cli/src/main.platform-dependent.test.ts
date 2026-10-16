import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { absPath, discoveryFilePath, getPlatform, type Platform } from "@runyard/platform";
import { registerSpawned } from "@runyard/testing";
import { afterEach, describe, expect, it } from "vitest";
import { createDeps, developmentConfig } from "./composition-root.ts";

// 进程阶段：真正的入口 main.ts 和真正的管理进程。所有测试都用 --root / home 指向 mktemp 目录，
// 绝不读写真实的 ~/Runyard 和 ~/.runyard。

const ENTRY = fileURLToPath(new URL("./main.ts", import.meta.url));
const CJK = /[\p{Script=Han}]/u;
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

async function runEntry(
  home: ReturnType<typeof tempHome>,
  args: string[],
  env: Record<string, string> = {},
  options: { holdStdin?: boolean } = {},
) {
  const platform = getPlatform({ home, profile: undefined });
  const child = platform.exec.spawn({
    argv: [process.execPath, ENTRY, "--root", home, ...args],
    cwd: home,
    env: { PATH: process.env.PATH ?? "", ...env },
    stdin: options.holdStdin === true,
  });
  registerSpawned(platform, child.ref);
  const [stdout, stderr, exit] = await Promise.all([
    collect(child.stdout),
    collect(child.stderr),
    child.exited,
  ]);
  child.stdin?.end();
  return { stdout, stderr, code: exit.exitCode };
}

describe("真实入口", () => {
  it("[CLI-COMMANDS-05] 标准输入是永不结束的管道时，缺少参数也立即以 USAGE、退出码 2 结束", async () => {
    const result = await runEntry(tempHome(), ["run", "--json"], {}, { holdStdin: true });
    expect(result.code).toBe(2);
    expect((JSON.parse(result.stdout) as { error: { code: string } }).error.code).toBe("USAGE");
  });

  it("[CLI-COMMANDS-11] 系统语言是中文时仍然输出英文", async () => {
    // 真管理进程里没有这个项目：PLAYGROUND_NOT_FOUND（3），错误信息是英文
    const result = await runEntry(tempHome(), ["run", "no-such-project"], {
      LANG: "zh_CN.UTF-8",
      LC_ALL: "zh_CN.UTF-8",
    });
    expect(result.code).toBe(3);
    expect(CJK.test(result.stderr)).toBe(false);
    expect(result.stdout).toBe("");
  });

  it("[CLI-COMMANDS-17] config set 写到 --root 下的 cli.json，get 读回；文本输出在标准输出", async () => {
    const home = tempHome();
    const set = await runEntry(home, ["config", "set", "lang", "zh-CN", "--json"]);
    expect(JSON.parse(set.stdout)).toEqual({ lang: "zh-CN" });
    const platform = getPlatform({ home, profile: undefined });
    const file = await platform.fs.readText(absPath(join(home, ".runyard", "cli.json")));
    expect(JSON.parse(file ?? "{}")).toEqual({ formatVersion: 1, lang: "zh-CN" });
    const get = await runEntry(home, ["config", "get", "lang", "--json"]);
    expect(JSON.parse(get.stdout)).toEqual({ lang: "zh-CN", source: "saved" });
    const text = await runEntry(home, ["config", "get", "lang"]);
    expect(CJK.test(text.stdout)).toBe(true);
    expect(text.stderr).toBe("");
    expect(text.code).toBe(0);
  });

  it("[CLI-COMMANDS-13] 不认识的语言：标准错误一行英文提示，标准输出仍是一个对象", async () => {
    const result = await runEntry(tempHome(), ["config", "get", "lang", "--lang", "fr", "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ lang: "en", source: "flag" });
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
  });

  it("[CLI-COMMANDS-15] --help 退出码 0，没有启动管理进程", async () => {
    const home = tempHome();
    const result = await runEntry(home, ["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("runyard");
    const platform = getPlatform({ home, profile: undefined });
    expect(await platform.fs.exists(discoveryFilePath(platform.paths.stateDir))).toBe(false);
  });
});

describe("组合根", () => {
  it("开发时的管理进程入口文件存在，connect 能经它从零拉起管理进程并连上", async () => {
    const home = tempHome();
    const platform: Platform = getPlatform({ home, profile: undefined });
    const config = developmentConfig();
    expect(await platform.fs.exists(absPath(config.supervisorCommand[1] ?? ""))).toBe(true);

    const client = await createDeps(config).connect(platform);
    let supervisor: { pid: number; startTime: number } | undefined;
    try {
      expect(client.launched).toBe(true);
      expect(client.supervisor.startedBy).toBe("cli");
      const file = await platform.fs.readText(discoveryFilePath(platform.paths.stateDir));
      const pid = (JSON.parse(file ?? "{}") as { pid: number }).pid;
      const identity = await platform.proc.identity(pid);
      if (identity !== null) {
        supervisor = { pid, startTime: identity.startTime };
        registerSpawned(platform, supervisor);
      }
    } finally {
      await client.call("supervisor.shutdown", { ifIdle: false, reason: "user" });
      client.close();
    }
    // 等管理进程真的退出：连接点没有监听者了
    const deadline = Date.now() + 15_000;
    for (;;) {
      const gone = await platform.ipc.connect(300).then(
        (socket) => {
          socket.destroy();
          return false;
        },
        () => true,
      );
      if (gone) break;
      if (Date.now() > deadline) throw new Error("supervisor did not exit");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    // 连接点没了不等于进程已退出：等到进程本身消失，守卫才不会把它当遗留
    while (supervisor !== undefined) {
      const now = await platform.proc.identity(supervisor.pid);
      if (now === null || now.startTime !== supervisor.startTime) break;
      if (Date.now() > deadline) throw new Error("supervisor process did not exit");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  });
});

// 等管理进程真的退出：先看连接点没有监听者，再看进程本身消失（守卫不会把它当遗留）
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

describe("模板命令连着真的管理进程", () => {
  it("[TEMPLATES-CUSTOM-23] template save 另存两个模板，template list 立即都列出来（临时主目录里的真进程）", async () => {
    const home = tempHome();
    // 资源库里放一个已有的项目：管理进程启动时的扫描会登记它
    const project = join(home, "Runyard", "pricing-table");
    mkdirSync(join(project, ".runyard"), { recursive: true });
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "App.tsx"), "export const edited = 1;\n");
    writeFileSync(
      join(project, ".runyard", "playground.json"),
      JSON.stringify({
        formatVersion: 1,
        id: "01PRICING",
        template: { id: "react19", source: "builtin", appVersion: "0.0.0" },
        runner: "vite",
        requires: { node: ">=22.18 <27" },
        toolchainAtCreate: {},
        createdAt: 1,
        createdBy: { kind: "user" },
        autoClean: { enabled: false },
        trust: "trusted",
      }),
    );
    const platform: Platform = getPlatform({ home, profile: undefined });
    // 先拉起管理进程并等它扫描完，命令行的第一条命令才不会赶在登记之前
    const client = await createDeps(developmentConfig()).connect(platform);
    try {
      await client.call("library.rescan", {});
      const saved = await runEntry(home, [
        "template",
        "save",
        "pricing-table",
        "--as",
        "my-pricing",
        "--name",
        "My pricing",
        "--json",
      ]);
      expect(saved.code).toBe(0);
      expect(JSON.parse(saved.stdout)).toMatchObject({
        id: "my-pricing",
        name: "My pricing",
        source: "user",
        path: join(home, ".runyard", "templates", "my-pricing"),
        files: ["src/App.tsx"],
      });
      const second = await runEntry(home, [
        "template",
        "save",
        "pricing-table",
        "--as",
        "other",
        "--json",
      ]);
      expect(second.code).toBe(0);
      const listed = await runEntry(home, ["template", "list", "--json"]);
      const { templates } = JSON.parse(listed.stdout) as {
        templates: { id: string; source: string; name: string }[];
      };
      expect(templates.filter((record) => record.source === "user")).toEqual([
        expect.objectContaining({ id: "my-pricing", name: "My pricing" }),
        expect.objectContaining({ id: "other", name: "other" }),
      ]);
      // 标识已被占用：NAME_EXISTS，退出码 9，文案读“模板标识”而不是“项目名称”
      const clash = await runEntry(home, [
        "template",
        "save",
        "pricing-table",
        "--as",
        "other",
        "--lang",
        "en",
      ]);
      expect(clash.code).toBe(9);
      expect(clash.stderr).toContain("template with the ID other already exists");
    } finally {
      await stopSupervisor(platform, client);
    }
  }, 30_000);
});
