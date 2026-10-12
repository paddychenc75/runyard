import type { ManagedProcess } from "@runyard/platform";
import { absPath } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { createFakePlatform } from "./fake-platform.ts";

const cwd = absPath("/fake/project");
const spawn = (fake: ReturnType<typeof createFakePlatform>, argv: string[], stdin = false) =>
  fake.platform.exec.spawn({ argv, cwd, env: {}, stdin });

async function readAll(stream: ManagedProcess["stdout"]): Promise<string> {
  const parts: Buffer[] = [];
  for await (const chunk of stream) parts.push(chunk as Buffer);
  return Buffer.concat(parts).toString("utf8");
}

describe("假进程：输出和退出", () => {
  it("按假时间写 stdout 和 stderr，自己退出后两路流都结束", async () => {
    const fake = createFakePlatform();
    fake.processes.when(["tool"], {
      output: [
        { atMs: 100, stream: "stdout", data: "hello\n" },
        { atMs: 200, stream: "stderr", data: "warn\n" },
      ],
      exit: { afterMs: 300, code: 3 },
    });
    const proc = spawn(fake, ["tool"]);
    const out = readAll(proc.stdout);
    const err = readAll(proc.stderr);
    await fake.clock.advance(299);
    expect(fake.processes.isAlive(proc.ref)).toBe(true);
    await fake.clock.advance(1);
    expect(await proc.exited).toEqual({ exitCode: 3 });
    expect(await out).toBe("hello\n");
    expect(await err).toBe("warn\n");
  });

  it("时间为 0 的输出和退出在启动时同步发生，exited 立刻可等", async () => {
    const fake = createFakePlatform();
    fake.processes.when(["quick"], {
      output: [{ atMs: 0, stream: "stdout", data: "v1\n" }],
      exit: { afterMs: 0, code: 0 },
    });
    const proc = spawn(fake, ["quick"]);
    expect(await proc.exited).toEqual({ exitCode: 0 });
    expect(await readAll(proc.stdout)).toBe("v1\n");
  });

  it("没有剧本的进程一直运行；后登记的剧本优先；spawn 记录参数和 stdin", async () => {
    const fake = createFakePlatform();
    fake.processes.when(["x"], { exit: { afterMs: 0, code: 1 } });
    fake.processes.when(["x"], { exit: { afterMs: 0, code: 2 } });
    expect(await spawn(fake, ["x"]).exited).toEqual({ exitCode: 2 });
    const idle = spawn(fake, ["other", "--flag"], true);
    idle.stdin?.write("input");
    expect(fake.processes.isAlive(idle.ref)).toBe(true);
    const record = fake.processes.spawned.at(-1);
    expect(record?.argv).toEqual(["other", "--flag"]);
    expect(record?.cwd).toBe(cwd);
    expect(record?.stdinText()).toBe("input");
  });

  it("spawnDetached 的输出追加进日志文件", async () => {
    const fake = createFakePlatform();
    const logFile = absPath("/fake/state/supervisor.log");
    fake.fs.mkdir(absPath("/fake/state"));
    fake.processes.when(["daemon"], {
      output: [{ atMs: 0, stream: "stdout", data: "up\n" }],
    });
    const { pid } = await fake.platform.exec.spawnDetached(["daemon"], { env: {}, logFile });
    expect(fake.processes.alive().map((ref) => ref.pid)).toEqual([pid]);
    expect(fake.fs.readFile(logFile)).toBe("up\n");
  });
});

describe("假进程：就绪和端口", () => {
  it("到点占住端口，退出后释放；端口已被占用时进程失败退出", async () => {
    const fake = createFakePlatform();
    fake.processes.when(["server"], { listenOn: { port: 7100, atMs: 500 } });
    const proc = spawn(fake, ["server"]);
    expect(await fake.platform.ports.isFree(7100)).toBe("free");
    await fake.clock.advance(500);
    expect(await fake.platform.ports.isFree(7100)).toBe("in-use");
    expect(await fake.platform.ports.occupant(7100)).toEqual({
      pid: proc.ref.pid,
      name: "server",
    });
    fake.processes.exit(proc.ref, 0);
    expect(await fake.platform.ports.isFree(7100)).toBe("free");

    fake.ports.occupy(7100, { pid: 1, name: "other" });
    const second = spawn(fake, ["server"]);
    await fake.clock.advance(500);
    expect(await second.exited).toEqual({ exitCode: 1 });
    expect(await readAll(second.stderr)).toContain("EADDRINUSE");
  });

  it("端口在进程结束后过 portReleaseDelayMs 才空出来", async () => {
    const fake = createFakePlatform();
    fake.processes.when(["slow-release"], {
      listenOn: { port: 7200, atMs: 0 },
      portReleaseDelayMs: 2500,
    });
    const proc = spawn(fake, ["slow-release"]);
    await fake.platform.proc.terminate(proc.ref, { mode: "kill", graceMs: 0 });
    expect(await fake.platform.ports.isFree(7200)).toBe("in-use");
    await fake.clock.advance(2499);
    expect(await fake.platform.ports.isFree(7200)).toBe("in-use");
    await fake.clock.advance(1);
    expect(await fake.platform.ports.isFree(7200)).toBe("free");
  });
});

describe("假进程：停止整棵树", () => {
  const tree = {
    children: [{ atMs: 0, behavior: { children: [{ atMs: 0 }] } }, { atMs: 0 }],
  };

  it("kill 立刻结束整棵树（含孙进程），members 先列出全部", async () => {
    const fake = createFakePlatform();
    fake.processes.when(["root"], tree);
    const proc = spawn(fake, ["root"]);
    expect(await fake.platform.proc.members(proc.ref)).toHaveLength(4);
    await fake.platform.proc.terminate(proc.ref, { mode: "kill", graceMs: 0 });
    expect(await fake.platform.proc.members(proc.ref)).toEqual([]);
    expect(fake.processes.alive()).toEqual([]);
    expect(await proc.exited).toEqual({ exitCode: null });
  });

  it("响应礼貌停止的进程树在 graceMs 之前就结束，不等满", async () => {
    const fake = createFakePlatform();
    fake.processes.when(["root"], { ...tree, stopExitCode: 0 });
    const proc = spawn(fake, ["root"]);
    await fake.platform.proc.terminate(proc.ref, { mode: "graceful", graceMs: 2000 });
    expect(fake.processes.alive()).toEqual([]);
    expect(await proc.exited).toEqual({ exitCode: 0 });
    expect(fake.clock.pendingTimers()).toBe(0);
  });

  it("忽略停止请求的进程：等满 graceMs 之后才被强制结束", async () => {
    const fake = createFakePlatform();
    fake.processes.when(["stubborn"], { ignoresStop: true });
    const proc = spawn(fake, ["stubborn"]);
    let done = false;
    const stopping = fake.platform.proc
      .terminate(proc.ref, { mode: "graceful", graceMs: 2000 })
      .then(() => {
        done = true;
      });
    await fake.clock.advance(1999);
    expect(done).toBe(false);
    expect(fake.processes.isAlive(proc.ref)).toBe(true);
    await fake.clock.advance(1);
    await stopping;
    expect(fake.processes.alive()).toEqual([]);
    expect(await proc.exited).toEqual({ exitCode: null });
  });

  it("stopDelayMs：礼貌停止后过一会儿才退出", async () => {
    const fake = createFakePlatform();
    fake.processes.when(["lazy"], { stopDelayMs: 800 });
    const proc = spawn(fake, ["lazy"]);
    const stopping = fake.platform.proc.terminate(proc.ref, { mode: "interrupt", graceMs: 2000 });
    await fake.clock.advance(800);
    await stopping;
    expect(fake.processes.isAlive(proc.ref)).toBe(false);
  });

  it("caps.gracefulStop 为 none 时，礼貌请求直接变成强制结束", async () => {
    const fake = createFakePlatform({ caps: { gracefulStop: "none" } });
    fake.processes.when(["stubborn"], { ignoresStop: true });
    const proc = spawn(fake, ["stubborn"]);
    await fake.platform.proc.terminate(proc.ref, { mode: "graceful", graceMs: 2000 });
    expect(fake.processes.isAlive(proc.ref)).toBe(false);
  });

  it("根进程已退出、后代还活着：按引用仍能停掉整棵树", async () => {
    const fake = createFakePlatform();
    fake.processes.when(["root"], { children: [{ atMs: 0 }] });
    const proc = spawn(fake, ["root"]);
    fake.processes.exit(proc.ref, 0);
    expect(await fake.platform.proc.members(proc.ref)).toHaveLength(1);
    await fake.platform.proc.terminate(proc.ref, { mode: "kill", graceMs: 0 });
    expect(fake.processes.alive()).toEqual([]);
  });

  it("脱离进程树的后代不被停止树的操作碰到，也不在 members 里", async () => {
    const fake = createFakePlatform();
    fake.processes.when(["next"], { children: [{ atMs: 0, detached: true }] });
    const proc = spawn(fake, ["next"]);
    expect(await fake.platform.proc.members(proc.ref)).toHaveLength(1);
    await fake.platform.proc.terminate(proc.ref, { mode: "kill", graceMs: 0 });
    expect(fake.processes.alive()).toHaveLength(1);
  });

  it("后代拿着输出管道不放：exited 在根退出时就完成，输出流要等后代走掉才结束", async () => {
    const fake = createFakePlatform();
    fake.processes.when(["root"], {
      children: [
        { atMs: 0, holdsOutputPipe: true, behavior: { exit: { afterMs: 1000, code: 0 } } },
      ],
    });
    const proc = spawn(fake, ["root"]);
    let closed = false;
    void readAll(proc.stdout).then(() => {
      closed = true;
    });
    fake.processes.exit(proc.ref, 0);
    expect(await proc.exited).toEqual({ exitCode: 0 });
    await fake.clock.advance(999);
    expect(closed).toBe(false);
    await fake.clock.advance(1);
    expect(closed).toBe(true);
  });
});

describe("假进程：进程号复用", () => {
  it("同一个 pid 换了启动时间：旧引用的 terminate 什么也不做，identity 报新的启动时间", async () => {
    const fake = createFakePlatform();
    const proc = spawn(fake, ["old"]);
    const old = proc.ref;
    fake.processes.exit(old, 0);
    expect(await fake.platform.proc.identity(old.pid)).toBeNull();

    await fake.clock.advance(5000);
    const stranger = fake.processes.addForeign({ pid: old.pid });
    expect(stranger.pid).toBe(old.pid);
    expect(stranger.startTime).not.toBe(old.startTime);
    expect(await fake.platform.proc.identity(old.pid)).toEqual({ startTime: stranger.startTime });

    await fake.platform.proc.terminate(old, { mode: "kill", graceMs: 0 });
    expect(fake.processes.isAlive(stranger)).toBe(true);
    await fake.platform.proc.terminate(stranger, { mode: "kill", graceMs: 0 });
    expect(fake.processes.isAlive(stranger)).toBe(false);
  });

  it("pid 还被活着的进程占着时不能复用", () => {
    const fake = createFakePlatform();
    const ref = fake.processes.addForeign();
    expect(() => fake.processes.addForeign({ pid: ref.pid })).toThrow();
  });
});

describe("假进程：按运行标记找进程", () => {
  const marker = { name: "RUNYARD_RUN_ID", value: "run-1" };

  it("[RUN-LIFECYCLE-20] 后代继承环境，脱离进程组的后代整树停止后仍在，按标记找得到并能结束", async () => {
    const fake = createFakePlatform();
    fake.processes.when(["next"], {
      children: [{ atMs: 0, detached: true, behavior: { exit: { afterMs: 950, code: 0 } } }],
    });
    const proc = fake.platform.exec.spawn({
      argv: ["next"],
      cwd,
      env: { RUNYARD_RUN_ID: "run-1" },
      stdin: false,
    });
    expect(await fake.platform.proc.findByMarker(marker)).toHaveLength(2);
    await fake.platform.proc.terminate(proc.ref, { mode: "graceful", graceMs: 100 });
    const strays = await fake.platform.proc.findByMarker(marker);
    expect(strays).toHaveLength(1);
    await fake.clock.advance(950);
    expect(await fake.platform.proc.findByMarker(marker)).toEqual([]);
  });

  it("值不同、名字不同、没有环境的进程都不命中", async () => {
    const fake = createFakePlatform();
    spawn(fake, ["a"]);
    fake.platform.exec.spawn({
      argv: ["b"],
      cwd,
      env: { RUNYARD_RUN_ID: "run-12" },
      stdin: false,
    });
    expect(await fake.platform.proc.findByMarker(marker)).toEqual([]);
  });
});
