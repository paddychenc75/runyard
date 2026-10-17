import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatform } from "@runyard/platform";
import { afterEach, describe, expect, it } from "vitest";
import type { TerminalSize } from "../../shared/terminal.ts";
import {
  type RealTerminals,
  type RealTerminalsOptions,
  realTerminals,
  removeRoot,
  waitGone,
} from "./test-support/real-terminals.ts";

// 主进程终端服务 + pty-host 核心 + 真的 node-pty 和 zsh（规格 desktop/terminal 的后台部分）。
// node-pty 的预编译文件只有 macOS 的（Linux 要现场编译，安装脚本按负责人的决定不跑，docs/architecture/dependencies.md），
// 所以这一组只在 macOS 上有意义：平台层说这不是 darwin 就整组跳过（macOS 上 node-pty 加载失败则测试自然失败）。
const onMac = getPlatform().id === "darwin";
const size: TerminalSize = { cols: 80, rows: 24 };

const live: RealTerminals[] = [];
afterEach(async () => {
  for (const terminals of live.splice(0)) {
    await terminals.service.dispose();
    removeRoot(terminals.root);
  }
});

function setup(options?: RealTerminalsOptions): RealTerminals {
  const terminals = realTerminals(options);
  live.push(terminals);
  return terminals;
}

/** 发一条命令（回车结尾），等到输出里出现只在结果里才有的文字 */
async function run(
  t: RealTerminals,
  project: string,
  command: string,
  expected: string | RegExp,
): Promise<string> {
  const out = t.output(project);
  const from = out.text.length;
  t.service.write(project, `${command}\r`);
  return await out.waitFor(expected, from);
}

// 见 #336
describe.skipIf(!onMac)("终端服务与真伪终端", () => {
  it("[DESKTOP-TERMINAL-01] 没人要终端时不启动任何 shell；第一次打开 1 秒内出现提示符，pwd 是项目文件夹", async () => {
    const t = setup();
    // 服务建好、项目在资源库里，但没有打开终端：没有 shell
    expect(t.service.runningProjects()).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(t.service.runningProjects()).toEqual([]);

    const began = Date.now();
    const snapshot = await t.open("demo", size);
    expect(snapshot.state.kind).toBe("running");
    await t.output("demo").waitFor("READY> ");
    expect(Date.now() - began).toBeLessThan(1000);
    await run(t, "demo", "pwd", `${t.folders.demo}\r\n`);
  });

  it("[DESKTOP-TERMINAL-02] 两个项目各开一个，各在自己的文件夹，是不同的 shell 进程", async () => {
    const t = setup();
    const demo = await t.open("demo", size);
    const api = await t.open("api", size);
    await run(t, "demo", "pwd", `${t.folders.demo}\r\n`);
    await run(t, "api", "pwd", `${t.folders.api}\r\n`);
    expect(demo.state.kind === "running" && api.state.kind === "running").toBe(true);
    if (demo.state.kind === "running" && api.state.kind === "running") {
      expect(demo.state.pid).not.toBe(api.state.pid);
    }
  });

  it("[DESKTOP-TERMINAL-03] 切走再回来是同一个终端：输出还在，历史命令能调出来，shell 进程号没变", async () => {
    const t = setup();
    const first = await t.open("demo", size);
    await run(t, "demo", "echo hello", /^hello\r?$/m);
    t.service.detach("demo");
    const again = await t.service.attach("demo");
    expect(again.state).toEqual(first.state);
    expect(again.output).toContain("hello");
    // 上方向键调出上一条命令，回车再执行一次：同一个 shell 的历史
    const out = t.output("demo");
    const from = out.text.length;
    await t.service.attach("demo");
    t.service.write("demo", "\u001b[A\r");
    await out.waitFor(/hello\r?\n/, from + "echo hello".length);
    expect(out.text.slice(from)).toContain("echo hello");
  });

  it("[DESKTOP-TERMINAL-04] 终端不显示时命令继续运行，3 秒后回来有 done 和下一个提示符", async () => {
    const t = setup();
    await t.open("demo", size);
    await t.output("demo").waitFor("READY> ");
    t.service.write("demo", "sleep 2; echo done_$((40+2))\r");
    t.service.detach("demo");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const snapshot = await t.service.attach("demo");
    const [, afterDone] = snapshot.output.split(/done_42\r?\n/);
    expect(afterDone).toContain("READY> "); // 命令跑完后 shell 画出了下一个提示符
  });

  it("[DESKTOP-TERMINAL-07] 应用环境里没有 SHELL 也用用户的登录 shell，以登录方式启动：echo $0 是 -zsh", async () => {
    const { SHELL: _shell, ...withoutShell } = process.env;
    const t = setup({ overrides: { baseEnv: withoutShell } });
    const snapshot = await t.open("demo", size);
    if (snapshot.state.kind !== "running") throw new Error("terminal did not start");
    expect(snapshot.state.shell).toBe("/bin/zsh");
    await run(t, "demo", "echo $0", /^-zsh\r?$/m);
  });

  it("[DESKTOP-TERMINAL-08] 只由 .zshrc 提供的工具（像 nvm 的 node）在终端里能用，应用自己的 PATH 里没有它", async () => {
    const t = setup({
      zshrc: "PROMPT='READY> '\nexport PATH=\"$HOME/fake-nvm/bin:$PATH\"\n",
    });
    const nodeDir = join(t.home, "fake-nvm", "bin");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(nodeDir, { recursive: true });
    writeFileSync(join(nodeDir, "node"), '#!/bin/sh\necho "v99.1.2"\n', { mode: 0o755 });
    expect(process.env.PATH ?? "").not.toContain("fake-nvm");
    await t.open("demo", size);
    await run(t, "demo", "node -v", /^v99\.1\.2\r?$/m);
  });

  it("随应用安装的 runyard 目录在 PATH 里：没把命令行装进系统也能直接执行 runyard（这里用桩脚本；真实命令行的 --version 见 PR 的未决问题）", async () => {
    const t = setup({ binDir: { runyard: '#!/bin/sh\necho "runyard 9.9.9-test"\n' } });
    expect(process.env.PATH ?? "").not.toContain(t.binDir ?? "unreachable");
    await t.open("demo", size);
    await run(t, "demo", "runyard --version; echo exit=$?", /exit=0\r?$/m);
    expect(t.output("demo").text).toContain("runyard 9.9.9-test");
  });

  it("[DESKTOP-TERMINAL-10] 中文文件名和中文输入输出不乱码（UTF-8）", async () => {
    const t = setup();
    writeFileSync(join(t.folders.demo as string, "笔记.md"), "# 笔记");
    await t.open("demo", size);
    await run(t, "demo", "ls", /笔记\.md/);
    await run(t, "demo", "echo 你好", /^你好\r?$/m);
  });

  it("登录 shell 起不来（文件不存在）时改用 /bin/zsh，带说明，工作目录仍是项目文件夹", async () => {
    const t = setup({ overrides: { loginShell: async () => "/usr/local/bin/fish-not-installed" } });
    const snapshot = await t.open("demo", size);
    expect(snapshot.state).toMatchObject({
      kind: "running",
      shell: "/bin/zsh",
      notice: {
        code: "SHELL_FALLBACK",
        shell: "/usr/local/bin/fish-not-installed",
        reason: "not-found",
      },
    });
    await run(t, "demo", "pwd", `${t.folders.demo}\r\n`);
  });

  it("[DESKTOP-TERMINAL-14] 面板变大行数变多、列数不变；终端大小传到 shell", async () => {
    const t = setup();
    await t.open("demo", { cols: 120, rows: 10 });
    await run(t, "demo", "stty size", /^10 120\r?$/m);
    t.service.resize("demo", { cols: 120, rows: 22 });
    await run(t, "demo", "stty size", /^22 120\r?$/m);
  });

  it("[DESKTOP-TERMINAL-25] exit 之后内容保留、退出码是 0；重新打开在项目文件夹里开新的，pwd 是项目文件夹", async () => {
    const t = setup();
    const first = await t.open("demo", size);
    await run(t, "demo", "echo before_$((20+22))", /^before_42\r?$/m);
    t.service.write("demo", "exit\r");
    await waitState(t, "demo", "ended");
    const ended = await t.service.attach("demo");
    expect(ended.state).toEqual({ kind: "ended", reason: "exited", exitCode: 0 });
    expect(ended.output).toContain("before_42");

    const fresh = await t.reopen("demo", size);
    expect(fresh.output).not.toContain("before_42"); // 旧内容不留（新终端只有自己的提示符）
    if (first.state.kind !== "running" || fresh.state.kind !== "running")
      throw new Error("not running");
    expect(fresh.state.pid).not.toBe(first.state.pid);
    await run(t, "demo", "pwd", `${t.folders.demo}\r\n`);
  });

  it("shell 带非零退出码退出：如实报告退出码", async () => {
    const t = setup();
    await t.open("demo", size);
    t.service.write("demo", "exit 3\r");
    await waitState(t, "demo", "ended");
    expect((await t.service.attach("demo")).state).toEqual({
      kind: "ended",
      reason: "exited",
      exitCode: 3,
    });
  });

  it("[DESKTOP-TERMINAL-27] 关闭标签页（结束终端）：3 秒内 shell 和后台作业 sleep 都不在了", async () => {
    const t = setup();
    const snapshot = await t.open("demo", size);
    if (snapshot.state.kind !== "running") throw new Error("not running");
    const out = await run(t, "demo", "sleep 1000 & echo BG=$!=", /BG=(\d+)=\r?$/m);
    const background = Number(/BG=(\d+)=\r?$/m.exec(out)?.[1]);
    expect(await t.platform.proc.identity(background)).not.toBeNull();

    const began = Date.now();
    await t.service.end("demo", "closed");
    expect(Date.now() - began).toBeLessThan(3000);
    expect(await waitGone(t.platform, snapshot.state.pid, 1000)).not.toBeNull();
    expect(await waitGone(t.platform, background, 1000)).not.toBeNull();
    expect(await t.service.attach("demo")).toEqual({ state: { kind: "none" }, output: "" });
  });

  it("结束一个前台正在运行命令的终端，命令也一起结束", async () => {
    const t = setup();
    const snapshot = await t.open("demo", size);
    if (snapshot.state.kind !== "running") throw new Error("not running");
    // 前台命令在 shell 的作业控制下自成一个进程组：先打印自己的进程号再变成 sleep（进程号不变）
    const out = await run(t, "demo", "sh -c 'echo FG=$$=; exec sleep 1000'", /FG=(\d+)=\r?$/m);
    const foreground = Number(/FG=(\d+)=\r?$/m.exec(out)?.[1]);
    await waitForeground(t, "demo", "sleep");
    expect(await t.platform.proc.identity(foreground)).not.toBeNull();
    await t.service.end("demo", "closed");
    expect(await allGone(t, [snapshot.state.pid, foreground], 1000)).toBe(true);
  });

  it("前台命令识别：空闲在提示符是 null，运行 sleep 时是 sleep，结束后又是 null（关标签页是否要确认靠它）", async () => {
    const t = setup();
    await t.open("demo", size);
    await t.output("demo").waitFor("READY> ");
    expect(await t.service.foreground("demo")).toEqual({ command: null });
    t.service.write("demo", "sleep 30\r");
    await waitForeground(t, "demo", "sleep");
    t.service.write("demo", "\u0003");
    await waitForeground(t, "demo", null);
  });

  it("[DESKTOP-TERMINAL-31] 窗口关了又回来（界面断开再接上）：还是原来的终端，里面的 sleep 仍在运行", async () => {
    const t = setup();
    const first = await t.open("demo", size);
    t.service.write("demo", "sleep 100\r");
    await waitForeground(t, "demo", "sleep");
    t.service.detach("demo");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const again = await t.service.attach("demo");
    expect(again.state).toEqual(first.state);
    expect(await t.service.foreground("demo")).toEqual({ command: "sleep" });
  });
});

async function waitState(t: RealTerminals, project: string, kind: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await t.service.attach(project)).state.kind === kind) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`terminal never reached ${kind}`);
}

async function waitForeground(
  t: RealTerminals,
  project: string,
  command: string | null,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await t.service.foreground(project)).command === command) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`foreground never became ${String(command)}`);
}

/** 全部成员都在 limitMs 内消失 */
async function allGone(t: RealTerminals, pids: number[], limitMs: number): Promise<boolean> {
  const waits = await Promise.all(pids.map((pid) => waitGone(t.platform, pid, limitMs)));
  return waits.every((waited) => waited !== null);
}
