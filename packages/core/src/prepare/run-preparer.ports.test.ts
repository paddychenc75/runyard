import { describe, expect, it } from "vitest";
import {
  createPrepareHarness,
  installArgv,
  installOk,
  serveOn,
  stopRun,
} from "./prepare-harness.test.ts";

describe("端口", () => {
  it("[RUN-PORTS-05] 每次运行沿用登记的端口：启动、停止、再启动都是 7104，没有 portFallback", async () => {
    const h = createPrepareHarness({ registeredPort: 7104 });
    h.fake.processes.when(installArgv, installOk);
    serveOn(h, 7104);
    const first = h.engine.start(h.request());
    await h.advance(500);
    expect(first.run.snapshot()).toMatchObject({ state: "ready", port: 7104 });
    expect(first.run.snapshot().portFallback).toBeUndefined();
    expect(first.run.snapshot().url).toBe("http://127.0.0.1:7104");
    await stopRun(h, first.run);
    const second = h.engine.start(h.request());
    await h.advance(500);
    expect(second.run.snapshot()).toMatchObject({ state: "ready", port: 7104 });
    expect(second.run.snapshot().portFallback).toBeUndefined();
  });

  it("[RUN-PORTS-06] 登记的端口被占用：本次换端口并 ready，带 portFallback、run.port 事件和提示", async () => {
    const h = createPrepareHarness({ registeredPort: 7104 });
    h.fake.processes.when(installArgv, installOk);
    h.fake.ports.occupy(7104, { pid: 4242, name: "python3" });
    serveOn(h, 7105);
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    expect(run.snapshot()).toMatchObject({
      state: "ready",
      port: 7105,
      portFallback: {
        wanted: 7104,
        reason: "PORT_OCCUPIED",
        occupant: { pid: 4242, name: "python3" },
      },
    });
    expect(h.portEvents).toEqual([
      {
        runId: run.runId,
        wanted: 7104,
        actual: 7105,
        reason: "PORT_OCCUPIED",
        occupant: { pid: 4242, name: "python3" },
      },
    ]);
    expect(h.notices()).toContainEqual({
      code: "PORT_FALLBACK",
      params: { wanted: 7104, actual: 7105, reason: "PORT_OCCUPIED" },
    });
    const server = h.fake.processes.spawned.find((s) => s.argv[1] === "server.js");
    expect(server?.env.PORT).toBe("7105");
  });

  it("[RUN-PORTS-07] 回退只对这一次有效：占用者走后再启动，仍用登记的 7104", async () => {
    const h = createPrepareHarness({ registeredPort: 7104 });
    h.fake.processes.when(installArgv, installOk);
    h.fake.ports.occupy(7104, { pid: 1, name: "x" });
    serveOn(h, 7105);
    serveOn(h, 7104);
    const first = h.engine.start(h.request());
    await h.advance(500);
    expect(first.run.snapshot().port).toBe(7105);
    await stopRun(h, first.run);
    h.fake.ports.release(7104);
    const second = h.engine.start(h.request());
    await h.advance(500);
    expect(second.run.snapshot().port).toBe(7104);
    expect(second.run.snapshot().portFallback).toBeUndefined();
    expect(h.subject.registeredPort).toBe(7104);
  });

  it("[RUN-PORTS-08] 回退端口被另一个（未运行的）项目登记着：不用它，选更后面的", async () => {
    const h = createPrepareHarness({ registeredPort: 7104, otherPorts: [7105] });
    h.fake.processes.when(installArgv, installOk);
    h.fake.ports.occupy(7104, { pid: 1, name: "x" });
    serveOn(h, 7106);
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    expect(run.snapshot().port).toBe(7106);
  });

  it("[RUN-PORTS-09] 命令行指定的端口只用一次：这次 7500，下次回到登记的端口", async () => {
    const h = createPrepareHarness({ registeredPort: 7104 });
    h.fake.processes.when(installArgv, installOk);
    serveOn(h, 7500);
    serveOn(h, 7104);
    const first = h.engine.start(h.request({ port: 7500 }));
    await h.advance(500);
    expect(first.run.snapshot().port).toBe(7500);
    await stopRun(h, first.run);
    const second = h.engine.start(h.request());
    await h.advance(500);
    expect(second.run.snapshot().port).toBe(7104);
  });

  it("[RUN-PORTS-15] 显式指定的端口被占用：failed 加 PORT_IN_USE（带 port），不换端口，不启动任何进程", async () => {
    const h = createPrepareHarness({ registeredPort: 7104 });
    h.fake.processes.when(installArgv, installOk);
    h.fake.ports.occupy(7500, { pid: 4242, name: "python3" });
    serveOn(h, 7501);
    serveOn(h, 7104);
    const { run } = h.engine.start(h.request({ port: 7500 }));
    await h.advance(500);
    expect(run.state).toBe("failed");
    expect(run.error()).toMatchObject({ code: "PORT_IN_USE", params: { port: 7500 } });
    expect(run.snapshot().reason).toBe("PORT_IN_USE");
    expect(run.snapshot().portFallback).toBeUndefined();
    expect(run.snapshot().port).toBeUndefined();
    expect(h.portEvents).toEqual([]);
    expect(h.fake.processes.spawned.some((s) => s.argv[1] === "server.js")).toBe(false);
  });

  it("[RUN-PORTS-15] 没有显式端口、登记的端口被占用：回退不变（RUN-PORTS-06）", async () => {
    const h = createPrepareHarness({ registeredPort: 7104 });
    h.fake.processes.when(installArgv, installOk);
    h.fake.ports.occupy(7104, { pid: 1, name: "x" });
    serveOn(h, 7105);
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    expect(run.error()).toBeUndefined();
    expect(run.snapshot()).toMatchObject({ state: "ready", port: 7105 });
  });

  it("[RUN-PORTS-03] 脚本没有端口：快照里没有 port 和 url，环境里没有 PORT", async () => {
    const { scriptRunner } = await import("./prepare-harness.test.ts");
    const h = createPrepareHarness({ runner: scriptRunner });
    h.fake.processes.when(["/fake/bin/python3", "-u", "main.py"], {
      exit: { afterMs: 20, code: 0 },
    });
    const { run } = h.engine.start(h.request());
    await h.advance(200);
    expect(run.error()).toBeUndefined();
    expect(run.state).toBe("finished");
    expect(run.snapshot().port).toBeUndefined();
    expect(run.snapshot().url).toBeUndefined();
    expect(h.fake.processes.spawned.at(-1)?.env.PORT).toBeUndefined();
  });

  it("[RUN-PORTS-12] 服务计划里的地址是字面量 127.0.0.1", async () => {
    const h = createPrepareHarness({ registeredPort: 7104 });
    h.fake.processes.when(installArgv, installOk);
    serveOn(h, 7104);
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    expect(run.snapshot().url?.startsWith("http://127.0.0.1:")).toBe(true);
  });
});
