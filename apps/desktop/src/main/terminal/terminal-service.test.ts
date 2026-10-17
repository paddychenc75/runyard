import type { ProcRef } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import type { TerminalEventName, TerminalEvents } from "../../shared/terminal.ts";
import { TerminalService } from "./terminal-service.ts";
import { FakeHostLink } from "./test-support/fake-host-link.ts";

const size = { cols: 80, rows: 24 };

function setup(folders: Record<string, string | null> = { demo: "/lib/demo", api: "/lib/api" }) {
  const links: FakeHostLink[] = [];
  let markers = 0;
  const emitted: { name: TerminalEventName; payload: unknown }[] = [];
  const killed: { ref: ProcRef | null; marker: string }[] = [];
  const service = new TerminalService({
    launch: () => {
      const link = new FakeHostLink();
      links.push(link);
      return link;
    },
    folderOf: (id) => folders[id] ?? null,
    emit: <E extends TerminalEventName>(name: E, payload: TerminalEvents[E]) =>
      void emitted.push({ name, payload }),
    killTerminal: async (target) => void killed.push(target),
    newMarker: () => `marker-${++markers}`,
    runyardBinDir: "/app/bin",
    openTimeoutMs: 200,
    endTimeoutMs: 100,
  });
  const link = (): FakeHostLink => {
    const first = links[0];
    if (first === undefined) throw new Error("pty-host was never launched");
    return first;
  };
  const states = (project: string) =>
    emitted
      .filter(
        (e) =>
          e.name === "terminal.state" && (e.payload as { project: string }).project === project,
      )
      .map((e) => (e.payload as TerminalEvents["terminal.state"]).state);
  return { service, links, link, emitted, killed, states };
}

describe("终端服务：按需创建", () => {
  it("[DESKTOP-TERMINAL-01] 打开项目标签页不创建任何东西：第一次 open 才启动 pty-host 和 shell，工作目录是项目文件夹", async () => {
    const { service, links, link } = setup();
    // 服务建好、标签页都开了，没有人要终端：什么都没启动
    expect(links).toHaveLength(0);
    expect(await service.attach("demo")).toEqual({ state: { kind: "none" }, output: "" });
    expect(links).toHaveLength(0);

    const snapshot = await service.open("demo", size);
    expect(links).toHaveLength(1);
    expect(snapshot.state).toMatchObject({ kind: "running", shell: "/bin/zsh" });
    expect(link().sent("open")).toEqual([
      {
        type: "open",
        project: "demo",
        cwd: "/lib/demo",
        cols: 80,
        rows: 24,
        env: {},
        marker: "marker-1",
        runyardBinDir: "/app/bin",
      },
    ]);
  });

  it("[DESKTOP-TERMINAL-02] 每个项目一个，各在自己的文件夹，是不同的 shell 进程", async () => {
    const { service, link } = setup();
    const demo = await service.open("demo", size);
    const api = await service.open("api", size);
    expect(
      link()
        .sent("open")
        .map((c) => [c.project, c.cwd]),
    ).toEqual([
      ["demo", "/lib/demo"],
      ["api", "/lib/api"],
    ]);
    const pids = [demo, api].map((s) => (s.state.kind === "running" ? s.state.pid : -1));
    expect(new Set(pids).size).toBe(2);
    // 只有一个 pty-host，同一个项目再 open 也不会多开
    await service.open("demo", size);
    expect(link().sent("open")).toHaveLength(2);
  });

  it("项目文件夹找不到：不启动 shell，状态是没能启动", async () => {
    const { service, links } = setup({ gone: null });
    const snapshot = await service.open("gone", size);
    expect(snapshot.state).toEqual({ kind: "ended", reason: "start-failed" });
    expect(links).toHaveLength(0);
  });

  it("pty-host 回报没起来、或一直没回应：状态是没能启动，open 不会卡住", async () => {
    const failing = setup();
    await failing.service.open("api", size);
    failing.link().startOk = false;
    expect((await failing.service.open("demo", size)).state).toEqual({
      kind: "ended",
      reason: "start-failed",
    });
    // 一直没回应：到时限就放弃
    const link = new FakeHostLink();
    link.silent = true;
    const service = new TerminalService({
      launch: () => link,
      folderOf: () => "/x",
      emit: () => {},
      killTerminal: async () => {},
      openTimeoutMs: 30,
    });
    expect((await service.open("demo", size)).state).toEqual({
      kind: "ended",
      reason: "start-failed",
    });
  });
});

describe("终端服务：切走再回来", () => {
  it("[DESKTOP-TERMINAL-03] 切回来是同一个终端：shell 进程号没变，之前的输出整段回放", async () => {
    const { service, link } = setup();
    const first = await service.open("demo", size);
    link().emit({ type: "data", project: "demo", data: "echo hello\r\nhello\r\n" });
    service.detach("demo");
    const second = await service.attach("demo");
    expect(second.state).toEqual(first.state);
    expect(second.output).toBe("echo hello\r\nhello\r\n");
    expect(link().sent("open")).toHaveLength(1);
  });

  it("[DESKTOP-TERMINAL-04] 终端不显示时命令照常运行、输出照常记录，shell 不会因为没人回执而停住", async () => {
    const { service, link, emitted } = setup();
    await service.open("demo", size);
    service.detach("demo");
    link().emit({ type: "data", project: "demo", data: "done\r\n" });
    // 没有推给界面，记在缓冲里；对 pty-host 立刻回执
    expect(emitted.filter((e) => e.name === "terminal.data")).toEqual([]);
    expect(link().sent("ack")).toEqual([{ type: "ack", project: "demo", length: 6 }]);
    expect((await service.attach("demo")).output).toBe("done\r\n");
  });

  it("[DESKTOP-TERMINAL-31] 窗口关了又回来：界面重新接上拿到同一个终端，里面的命令没停", async () => {
    const { service, link } = setup();
    await service.open("demo", size);
    link().foregroundOf.demo = "sleep";
    service.detach("demo"); // 窗口关了，界面不再显示
    expect(link().sent("end")).toEqual([]);
    expect((await service.attach("demo")).state.kind).toBe("running");
    expect(await service.foreground("demo")).toEqual({ command: "sleep" });
  });
});

describe("终端服务：输出流控", () => {
  it("接上界面后输出推给界面，界面回执多少才把多少回执给 pty-host", async () => {
    const { service, link, emitted } = setup();
    await service.open("demo", size);
    link().emit({ type: "data", project: "demo", data: "abcdef" });
    expect(emitted.filter((e) => e.name === "terminal.data")).toHaveLength(1);
    expect(link().sent("ack")).toEqual([]);
    service.ack("demo", 4);
    service.ack("demo", 100); // 多报的不会让 pty-host 多放行
    expect(
      link()
        .sent("ack")
        .map((a) => a.length),
    ).toEqual([4, 2]);
  });

  it("界面中途离开（detach）：没回执的输出当作已处理，别让 shell 一直停着", async () => {
    const { service, link } = setup();
    await service.open("demo", size);
    link().emit({ type: "data", project: "demo", data: "abcdef" });
    service.detach("demo");
    expect(
      link()
        .sent("ack")
        .map((a) => a.length),
    ).toEqual([6]);
  });

  it("写入、改大小只在终端运行时送出；改大小会记住，重新打开用最新的大小", async () => {
    const { service, link } = setup();
    service.write("demo", "ignored: no terminal yet");
    await service.open("demo", size);
    service.write("demo", "ls\r");
    service.resize("demo", { cols: 120, rows: 40 });
    expect(link().sent("write")).toEqual([{ type: "write", project: "demo", data: "ls\r" }]);
    expect(link().sent("resize")).toEqual([
      { type: "resize", project: "demo", cols: 120, rows: 40 },
    ]);
  });

  it("⌘K 清掉记下的输出，终端本身不受影响", async () => {
    const { service, link } = setup();
    await service.open("demo", size);
    link().emit({ type: "data", project: "demo", data: "a\r\nb\r\n" });
    service.clear("demo");
    link().emit({ type: "data", project: "demo", data: "$ " });
    const snapshot = await service.attach("demo");
    expect(snapshot.output).toBe("$ ");
    expect(snapshot.state.kind).toBe("running");
  });
});

describe("终端服务：结束和重新打开", () => {
  it("[DESKTOP-TERMINAL-25] shell 自己退出（exit）：内容保留，状态带退出码，重新打开在项目文件夹里开新的、旧内容不留", async () => {
    const { service, link, states } = setup();
    await service.open("demo", size);
    link().emit({ type: "data", project: "demo", data: "old output\r\n" });
    link().emit({ type: "exit", project: "demo", exitCode: 0, requested: false });
    expect(states("demo").at(-1)).toEqual({ kind: "ended", reason: "exited", exitCode: 0 });
    const ended = await service.attach("demo");
    expect(ended.output).toBe("old output\r\n");
    // 已结束的终端 open 只给现状，不会悄悄开新的
    expect((await service.open("demo", size)).state).toMatchObject({ kind: "ended" });
    expect(link().sent("open")).toHaveLength(1);

    const fresh = await service.reopen("demo", size);
    expect(fresh.state.kind).toBe("running");
    expect(fresh.output).toBe("");
    expect(link().sent("open").at(-1)).toMatchObject({ cwd: "/lib/demo" });
  });

  it("被信号结束的 shell（没有退出码）也如实报告", async () => {
    const { service, link, states } = setup();
    await service.open("demo", size);
    link().emit({ type: "exit", project: "demo", exitCode: null, requested: false });
    expect(states("demo").at(-1)).toEqual({ kind: "ended", reason: "exited", exitCode: null });
  });

  it("[DESKTOP-TERMINAL-26] pty-host 意外结束：所有终端都变成意外结束，输出保留，主进程亲手收拾它们留下的 shell，之后能重新打开", async () => {
    const { service, link, links, states, killed } = setup();
    await service.open("demo", size);
    await service.open("api", size);
    link().emit({ type: "data", project: "demo", data: "work\r\n" });
    link().crash();
    expect(states("demo").at(-1)).toEqual({ kind: "ended", reason: "host-crashed" });
    expect(states("api").at(-1)).toEqual({ kind: "ended", reason: "host-crashed" });
    expect((await service.attach("demo")).output).toBe("work\r\n");
    expect(killed.map((target) => target.ref?.pid).sort()).toEqual([5000, 5001]);
    expect(killed[0]?.ref?.startTime).toBe(50000);
    // 连脱离了进程组的后代也靠各自终端的标记收拾
    expect(killed.map((target) => target.marker).sort()).toEqual(["marker-1", "marker-2"]);

    // 重新打开会起一个新的 pty-host
    const reopened = await service.reopen("demo", size);
    expect(links).toHaveLength(2);
    expect(reopened.state.kind).toBe("running");
    expect((await service.attach("api")).state).toMatchObject({ reason: "host-crashed" });
  });

  it("[DESKTOP-TERMINAL-27] 关标签页（end closed）：等 pty-host 把 shell 和作业都收拾完才返回，终端记录清掉，再打开是全新的", async () => {
    const { service, link } = setup();
    await service.open("demo", size);
    link().emit({ type: "data", project: "demo", data: "stuff\r\n" });
    await service.end("demo", "closed");
    expect(link().sent("end")).toHaveLength(1);
    expect(await service.attach("demo")).toEqual({ state: { kind: "none" }, output: "" });
    // 关掉之后的退出事件不会被当成“shell 自己退出”
    expect((await service.open("demo", size)).output).toBe("");
  });

  it("结束一个没有终端的项目：直接完成；同时结束两次只发一次", async () => {
    const { service, link } = setup();
    await service.end("nope", "closed");
    await service.open("demo", size);
    await Promise.all([service.end("demo", "closed"), service.end("demo", "trashed")]);
    expect(link().sent("end")).toHaveLength(1);
  });

  it("改名（end renamed）：终端结束，状态是“项目已改名”并保留内容；重新打开用现在的文件夹", async () => {
    const folders: Record<string, string | null> = { demo: "/lib/demo" };
    const { service, link, states } = setup(folders);
    await service.open("demo", size);
    link().emit({ type: "data", project: "demo", data: "old\r\n" });
    await service.end("demo", "renamed");
    expect(states("demo").at(-1)).toEqual({ kind: "ended", reason: "renamed" });
    // 重复的改名通知（应用内先结束、管理进程又请求一次）不会重复报状态
    const before = states("demo").length;
    await service.end("demo", "renamed");
    expect(states("demo")).toHaveLength(before);
    folders.demo = "/lib/demo2";
    await service.reopen("demo", size);
    expect(link().sent("open").at(-1)).toMatchObject({ cwd: "/lib/demo2" });
  });

  it("pty-host 在时限内没收拾完（卡住）：主进程按进程身份亲手整组结束", async () => {
    const { service, link, killed } = setup();
    await service.open("demo", size);
    link().stuckOnEnd = true;
    await service.end("demo", "closed");
    expect(killed).toEqual([{ ref: { pid: 5000, startTime: 50000 }, marker: "marker-1" }]);
  });

  it("退出应用（dispose）：结束全部终端，再让 pty-host 退出；pty-host 的退出不算意外", async () => {
    const { service, link, states } = setup();
    await service.open("demo", size);
    await service.open("api", size);
    await service.dispose();
    expect(
      link()
        .sent("end")
        .map((c) => c.project)
        .sort(),
    ).toEqual(["api", "demo"]);
    expect(link().killed).toBe(true);
    link().crash();
    expect(states("demo").some((s) => "reason" in s && s.reason === "host-crashed")).toBe(false);
  });
});

describe("终端服务：终端里在运行的命令", () => {
  it("空闲是 null；有命令是命令名；没开终端是 null", async () => {
    const { service, link } = setup();
    expect(await service.foreground("demo")).toEqual({ command: null });
    await service.open("demo", size);
    expect(await service.foreground("demo")).toEqual({ command: null });
    link().foregroundOf.demo = "pnpm";
    expect(await service.foreground("demo")).toEqual({ command: "pnpm" });
  });

  it("列出所有在运行命令的终端（⌘Q 的确认用），空闲的不列", async () => {
    const { service, link } = setup();
    await service.open("demo", size);
    await service.open("api", size);
    link().foregroundOf.demo = "tail";
    expect(await service.busyCommands()).toEqual([{ project: "demo", command: "tail" }]);
  });

  it("pty-host 在回答之前崩了：不会一直等", async () => {
    const { service, link } = setup();
    await service.open("demo", size);
    link().silent = true;
    const pending = service.foreground("demo");
    link().crash();
    expect(await pending).toEqual({ command: null });
  });
});

describe("终端服务：回滚缓冲的行数", () => {
  it("只记最近 N 行（缺省 10000）", async () => {
    const links: FakeHostLink[] = [];
    const service = new TerminalService({
      launch: () => {
        const link = new FakeHostLink();
        links.push(link);
        return link;
      },
      folderOf: () => "/x",
      emit: () => {},
      killTerminal: async () => {},
      scrollbackLines: 3,
    });
    await service.open("demo", size);
    links[0]?.emit({ type: "data", project: "demo", data: "1\r\n2\r\n3\r\n4\r\n5\r\n" });
    expect((await service.attach("demo")).output).toBe("3\r\n4\r\n5\r\n");
  });
});
