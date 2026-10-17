import { describe, expect, it, vi } from "vitest";
import type { HostCommand, HostEvent } from "../shared/pty-host-messages.ts";
import { HIGH_WATER, LOW_WATER, PtyHost } from "./host.ts";
import { harness } from "./test-support/fake-pty.ts";

const open = (project = "demo"): HostCommand => ({
  type: "open",
  project,
  cwd: `/lib/${project}`,
  cols: 80,
  rows: 24,
  env: {},
  marker: "marker-1",
  runyardBinDir: "/app/bin",
});

const of = <T extends HostEvent["type"]>(events: HostEvent[], type: T) =>
  events.filter((event): event is Extract<HostEvent, { type: T }> => event.type === type);

async function started(h: ReturnType<typeof harness>, host: PtyHost, project = "demo") {
  host.handle(open(project));
  await vi.waitFor(() =>
    expect(of(h.events, "started").length + of(h.events, "start-failed").length).toBeGreaterThan(0),
  );
}

describe("pty-host：开终端", () => {
  it("在项目文件夹里以登录方式开用户的 shell，环境整理过，开好后回报进程号和 shell", async () => {
    const h = harness({ login: "/usr/local/bin/bash" });
    const host = new PtyHost(h.deps);
    await started(h, host);
    const call = h.spawns[0];
    expect(call?.file).toBe("/bin/bash");
    expect(call?.args.at(-1)).toBe("/usr/local/bin/bash");
    expect(call?.options.cwd).toBe("/lib/demo");
    expect(call?.options).toMatchObject({ cols: 80, rows: 24 });
    expect(call?.options.env.PATH).toBe("/app/bin:/usr/bin:/bin");
    expect(call?.options.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(call?.options.env.RUNYARD_TERMINAL).toBe("marker-1");
    expect(of(h.events, "started")).toEqual([
      {
        type: "started",
        project: "demo",
        pid: 1000,
        startTime: 10000,
        shell: "/usr/local/bin/bash",
      },
    ]);
  });

  it("登录 shell 的文件不存在：改用 /bin/zsh，并说明没能启动哪个 shell 和原因", async () => {
    const h = harness({
      login: "/usr/local/bin/fish",
      check: (path) => (path === "/usr/local/bin/fish" ? "not-found" : "ok"),
    });
    const host = new PtyHost(h.deps);
    await started(h, host);
    expect(h.spawns).toHaveLength(1);
    expect(h.spawns[0]?.args.at(-1)).toBe("/bin/zsh");
    expect(h.spawns[0]?.options.cwd).toBe("/lib/demo");
    expect(of(h.events, "started")[0]).toMatchObject({
      shell: "/bin/zsh",
      notice: { code: "SHELL_FALLBACK", shell: "/usr/local/bin/fish", reason: "not-found" },
    });
  });

  it("登录 shell 不能执行、起不来、起来就退出：各自带上对应的原因，再改用 /bin/zsh", async () => {
    for (const [name, h, reason] of [
      [
        "不能执行",
        harness({ login: "/x/sh", check: (p) => (p === "/x/sh" ? "not-executable" : "ok") }),
        "not-executable",
      ],
      ["起不来", harness({ login: "/x/sh", behaviors: ["throw"] }), "spawn-failed"],
      ["起来就退出", harness({ login: "/x/sh", behaviors: ["exit-early"] }), "exited-early"],
    ] as const) {
      const host = new PtyHost(h.deps);
      await started(h, host);
      expect(of(h.events, "started")[0], name).toMatchObject({
        shell: "/bin/zsh",
        notice: { code: "SHELL_FALLBACK", shell: "/x/sh", reason },
      });
      // 起来就退出的那个会话不能报成“终端已结束”
      expect(of(h.events, "exit"), name).toEqual([]);
    }
  });

  it("登录 shell 本来就是 /bin/zsh 且正常：没有说明", async () => {
    const h = harness({ login: "/bin/zsh" });
    const host = new PtyHost(h.deps);
    await started(h, host);
    expect(of(h.events, "started")[0]?.notice).toBeUndefined();
  });

  it("连 /bin/zsh 也起不来：回报没起来，不抛异常、不留会话", async () => {
    const h = harness({ login: "/x/sh", behaviors: ["throw", "throw"] });
    const host = new PtyHost(h.deps);
    await started(h, host);
    expect(of(h.events, "start-failed")).toEqual([{ type: "start-failed", project: "demo" }]);
    expect(of(h.events, "started")).toEqual([]);
  });

  it("同一个项目重复开只开一个", async () => {
    const h = harness();
    const host = new PtyHost(h.deps);
    host.handle(open());
    host.handle(open());
    await vi.waitFor(() => expect(of(h.events, "started")).toHaveLength(1));
    host.handle(open());
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(h.spawns).toHaveLength(1);
  });

  it("两个项目各开各的，进程不同", async () => {
    const h = harness();
    const host = new PtyHost(h.deps);
    host.handle(open("demo"));
    host.handle(open("api"));
    await vi.waitFor(() => expect(of(h.events, "started")).toHaveLength(2));
    expect(h.spawns.map((s) => s.options.cwd).sort()).toEqual(["/lib/api", "/lib/demo"]);
    expect(new Set(of(h.events, "started").map((e) => e.pid)).size).toBe(2);
  });
});

describe("pty-host：输入、大小、流控", () => {
  it("写入和改大小原样交给对应的伪终端", async () => {
    const h = harness();
    const host = new PtyHost(h.deps);
    await started(h, host);
    host.handle({ type: "write", project: "demo", data: "ls\r" });
    host.handle({ type: "resize", project: "demo", cols: 120, rows: 40 });
    await vi.waitFor(() => expect(h.spawns[0]?.pty.resized).toHaveLength(1));
    expect(h.spawns[0]?.pty.written).toEqual(["ls\r"]);
    expect(h.spawns[0]?.pty.resized).toEqual([{ cols: 120, rows: 40 }]);
  });

  it("没回执的输出超过上限就让伪终端暂停，回执到下限以下再继续", async () => {
    const h = harness();
    const host = new PtyHost(h.deps);
    await started(h, host);
    const pty = h.spawns[0]?.pty;
    if (pty === undefined) throw new Error("no pty");
    // 假终端起来时已经输出了一句提示符（8 个字符）还没回执
    const prompt = "prompt% ".length;
    pty.emitData("x".repeat(HIGH_WATER - prompt));
    expect(pty.pauses).toBe(0);
    pty.emitData("y");
    expect(pty.pauses).toBe(1);
    // 只回执一小部分：仍高于下限，继续暂停
    host.handle({ type: "ack", project: "demo", length: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(pty.resumes).toBe(0);
    // 回执到恰好降到下限：继续
    host.handle({ type: "ack", project: "demo", length: HIGH_WATER + 1 - 1000 - LOW_WATER });
    await vi.waitFor(() => expect(pty.resumes).toBe(1));
    // 之后再积压到上限才会再次暂停
    pty.emitData("z");
    expect(pty.pauses).toBe(1);
  });
});

describe("pty-host：结束和退出", () => {
  it("shell 自己退出：回报退出码，之后的写入不再送出", async () => {
    const h = harness();
    const host = new PtyHost(h.deps);
    await started(h, host);
    const pty = h.spawns[0]?.pty;
    pty?.emitExit(3);
    expect(of(h.events, "exit")).toEqual([
      { type: "exit", project: "demo", exitCode: 3, requested: false },
    ]);
    host.handle({ type: "write", project: "demo", data: "x" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(pty?.written).toEqual([]);
  });

  it("结束：先让 shell 退出，再按进程身份整组收尾，退出事件标明是主动结束，最后回 closed", async () => {
    const h = harness();
    const host = new PtyHost(h.deps);
    await started(h, host);
    host.handle({ type: "end", project: "demo", id: 7 });
    await vi.waitFor(() => expect(of(h.events, "closed")).toHaveLength(1));
    expect(h.spawns[0]?.pty.killed).toHaveLength(1);
    expect(h.terminated).toEqual([{ pid: 1000, startTime: 10000, mode: "graceful" }]);
    expect(of(h.events, "exit")).toEqual([
      { type: "exit", project: "demo", exitCode: 129, requested: true },
    ]);
    expect(of(h.events, "closed")).toEqual([{ type: "closed", project: "demo", id: 7 }]);
  });

  it("结束时按终端标记找出脱离了进程组的残余进程（nohup、setsid 起的），逐个整组结束", async () => {
    const h = harness();
    h.strays.push(7001, 7002);
    const host = new PtyHost(h.deps);
    await started(h, host);
    host.handle({ type: "end", project: "demo", id: 1 });
    await vi.waitFor(() => expect(of(h.events, "closed")).toHaveLength(1));
    expect(h.markersAsked).toEqual([{ name: "RUNYARD_TERMINAL", value: "marker-1" }]);
    expect(h.terminated.map((t) => [t.pid, t.mode])).toEqual([
      [1000, "graceful"],
      [7001, "kill"],
      [7002, "kill"],
    ]);
  });

  it("结束一个没有的终端：直接回 closed", async () => {
    const h = harness();
    const host = new PtyHost(h.deps);
    host.handle({ type: "end", project: "nope", id: 1 });
    await vi.waitFor(() => expect(of(h.events, "closed")).toHaveLength(1));
    expect(h.terminated).toEqual([]);
  });

  it("shell 不理会挂断也要收尾：整组仍然被结束，不等它自己退出", async () => {
    const h = harness();
    const originalSpawn = h.deps.spawn;
    const deps = {
      ...h.deps,
      spawn: (...args: Parameters<typeof originalSpawn>) => {
        const pty = originalSpawn(...args);
        // 像一个忽略 SIGHUP 的 shell：kill 了也不退出
        pty.kill = () => {};
        return pty;
      },
    };
    const host = new PtyHost(deps);
    host.handle(open());
    await vi.waitFor(() => expect(of(h.events, "started")).toHaveLength(1));
    host.handle({ type: "end", project: "demo", id: 1 });
    await vi.waitFor(() => expect(h.terminated).toHaveLength(1), { timeout: 3000 });
    expect(h.terminated[0]).toMatchObject({ pid: 1000, mode: "graceful" });
  });

  it("dispose 结束全部终端", async () => {
    const h = harness();
    const host = new PtyHost(h.deps);
    host.handle(open("demo"));
    host.handle(open("api"));
    await vi.waitFor(() => expect(of(h.events, "started")).toHaveLength(2));
    await host.dispose();
    expect(h.terminated.map((t) => t.pid).sort()).toEqual([1000, 1001]);
  });
});

describe("pty-host：前台命令", () => {
  it("空闲在提示符是 null，有命令在运行时是命令名", async () => {
    const h = harness();
    const host = new PtyHost(h.deps);
    await started(h, host);
    const pty = h.spawns[0]?.pty;
    if (pty === undefined) throw new Error("no pty");
    host.handle({ type: "foreground", project: "demo", id: 1 });
    await vi.waitFor(() => expect(of(h.events, "foreground")).toHaveLength(1));
    pty.process = "pnpm";
    host.handle({ type: "foreground", project: "demo", id: 2 });
    await vi.waitFor(() => expect(of(h.events, "foreground")).toHaveLength(2));
    expect(of(h.events, "foreground").map((e) => [e.id, e.command])).toEqual([
      [1, null],
      [2, "pnpm"],
    ]);
  });
});
