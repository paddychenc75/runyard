import { join } from "node:path";
import { absPath, type ProcRef } from "@runyard/platform";
import type { RunRecord, RunSnapshot } from "@runyard/protocol";
import { describe, expect, it, vi } from "vitest";
import { cliOwner, RunWorld } from "./run-harness.test.ts";
import { runRecordsDir } from "./run-record-store.ts";

// 崩溃后清理（规格 supervisor/lifecycle 的崩溃清理一节）：假平台上，“上次的管理进程”留下的是
// 仍在运行的假进程树和 runs/<runId>.json；新的管理进程启动时核对 pid 加启动时间。

const PORT = 7500;

/** 上次留下的一个服务：根进程带一个子进程，占着端口 */
function leftover(w: RunWorld): ProcRef {
  const { fake } = w.world;
  fake.processes.when(["node", "old-server.js", String(PORT)], {
    listenOn: { port: PORT, atMs: 0 },
    children: [{ atMs: 0 }],
  });
  const proc = fake.platform.exec.spawn({
    argv: ["node", "old-server.js", String(PORT)],
    cwd: absPath("/work/old"),
    env: {},
    stdin: false,
  });
  return proc.ref;
}

function writeRecord(w: RunWorld, ref: ProcRef, overrides: Partial<RunRecord> = {}): RunRecord {
  const record: RunRecord = {
    formatVersion: 1,
    runId: "run-old-1",
    playgroundId: "pg-old",
    owner: cliOwner,
    pid: ref.pid,
    processStart: ref.startTime,
    cwd: "/work/old",
    port: PORT,
    command: ["node", "old-server.js", String(PORT)],
    startedAt: 1,
    state: "ready",
    marker: "run-old-1",
    ...overrides,
  };
  const { fs, platform } = w.world.fake;
  fs.writeFile(
    absPath(join(runRecordsDir(platform), `${record.runId}.json`)),
    JSON.stringify(record),
  );
  return record;
}

const recordPath = (w: RunWorld, runId: string) =>
  absPath(join(runRecordsDir(w.world.fake.platform), `${runId}.json`));

async function settled(w: RunWorld): Promise<void> {
  await w.until(async () => w.world.fake.processes.alive().length === 0, 50, 100);
}

describe("崩溃后清理", () => {
  it("[SUPERVISOR-LIFECYCLE-16] 上次的管理进程被强杀：记录里的子进程树整棵结束，运行标为 crashed，端口可重新绑定", async () => {
    const w = new RunWorld();
    const ref = leftover(w);
    expect(w.world.fake.processes.alive()).toHaveLength(2);
    writeRecord(w, ref);

    // 新的管理进程启动；清理在写发现文件之前做，所以假时间要边走边等
    await w.drive(w.start());
    await settled(w);

    expect(await w.world.fake.platform.ports.isFree(PORT)).toBe("free");
    const app = await w.app();
    const run = await app.result<RunSnapshot>("run.get", { runId: "run-old-1" });
    expect(run).toMatchObject({ state: "crashed", playgroundId: "pg-old", pid: ref.pid });
    expect(w.world.fake.fs.exists(recordPath(w, "run-old-1"))).toBe(false);
    const running = await app.result<RunSnapshot[]>("run.list", { running: true });
    expect(running).toEqual([]);
    await w.dispose();
  });

  it("[SUPERVISOR-LIFECYCLE-17] 进程号被复用（启动时间与记录不符）：无关进程不被结束，该运行只被标为 crashed", async () => {
    const w = new RunWorld();
    const ref = leftover(w);
    writeRecord(w, ref, { processStart: ref.startTime + 1 });
    // 身份对不上时，连结束进程的请求都不该发出（不能只靠平台层再核对一次）
    const terminate = vi.spyOn(w.world.fake.platform.proc, "terminate");

    await w.drive(w.start());
    expect(terminate).not.toHaveBeenCalled();

    // 进程树原封不动，端口仍被占用
    expect(w.world.fake.processes.alive()).toHaveLength(2);
    expect(await w.world.fake.platform.ports.isFree(PORT)).toBe("in-use");
    const app = await w.app();
    const run = await app.result<RunSnapshot>("run.get", { runId: "run-old-1" });
    expect(run.state).toBe("crashed");
    expect(w.world.fake.fs.exists(recordPath(w, "run-old-1"))).toBe(false);
    await w.dispose();
  });

  it("记录里的进程早已不在：只标为 crashed，记录被清掉", async () => {
    const w = new RunWorld();
    writeRecord(w, { pid: 424242, startTime: 1 });

    await w.drive(w.start());
    const app = await w.app();
    expect((await app.result<RunSnapshot>("run.get", { runId: "run-old-1" })).state).toBe(
      "crashed",
    );
    expect(w.world.fake.fs.exists(recordPath(w, "run-old-1"))).toBe(false);
    await w.dispose();
  });

  it("记录坏了：改名留存，身份无从核对，里面的进程不结束", async () => {
    const w = new RunWorld();
    const ref = leftover(w);
    w.world.fake.fs.writeFile(recordPath(w, "run-bad"), "{ not json");

    await w.drive(w.start());
    expect(w.world.fake.processes.alive()).toHaveLength(2);
    expect(w.world.fake.fs.exists(recordPath(w, "run-bad"))).toBe(false);
    expect(w.logs.join("\n")).toContain("unreadable");
    expect(ref.pid).toBeGreaterThan(0);
    await w.dispose();
  });
});

describe("运行记录的写和删", () => {
  it("进程起来时写记录（pid、启动时间、命令、端口），运行结束时删", async () => {
    const w = new RunWorld();
    await w.start();
    const app = await w.app();
    const id = await w.newProject(app, "demo");
    w.server(undefined);
    const run = await w.startRun(app, id, cliOwner);
    await w.ready(app, run.runId);

    await w.until(async () => w.world.fake.fs.exists(recordPath(w, run.runId)), 50, 40);
    const record = JSON.parse(w.world.fake.fs.readFile(recordPath(w, run.runId))) as RunRecord;
    const alive = w.world.fake.processes.alive();
    const { pid } = await app.result<RunSnapshot>("run.get", { runId: run.runId });
    expect(record).toMatchObject({
      runId: run.runId,
      playgroundId: id,
      pid,
      port: w.portOf(id),
      owner: cliOwner,
    });
    expect(alive.map((p) => p.startTime)).toContain(record.processStart);
    expect(record.command[1]).toBe("server.js");

    await w.drive(app.result("run.stop", { runId: run.runId }));
    await w.until(async () => !w.world.fake.fs.exists(recordPath(w, run.runId)), 50, 40);
    await w.dispose();
  });
});
