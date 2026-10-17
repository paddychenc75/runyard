import type { RequestResult, RequestSpec } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import type { SendOptions } from "./request-send.ts";
import { cliOwner, RunWorld, tabOwner } from "./run-harness.test.ts";

// request.send / request.getLast 经管理进程的方法分发走一遍（运行用假进程，真正发请求的函数换成替身）。
// 真的 http 往返在 request-send.test.ts。

const MIN = 60_000;
const spec: RequestSpec = {
  method: "POST",
  path: "/todos",
  headers: [{ name: "content-type", value: "application/json" }],
  payload: '{"title":"x"}',
};
const answer: RequestResult = {
  outcome: "response",
  status: 201,
  statusText: "Created",
  durationMs: 5,
  size: 2,
  headers: [],
  payload: "ok",
};

async function setup(owner = tabOwner()) {
  const w = new RunWorld();
  const calls: SendOptions[] = [];
  w.sendRequest = async (options) => {
    calls.push(options);
    return answer;
  };
  await w.start();
  const app = await w.app();
  const id = await w.newProject(app, "demo");
  w.server("demo");
  const run = await w.startRun(app, id, owner);
  return { w, app, id, run, calls };
}

describe("请求面板的方法", () => {
  it("[DESKTOP-REQUEST-PANEL-01] 就绪的服务：请求发往这个运行的端口（端口取自运行，不取自调用方）", async () => {
    const { w, app, id, run, calls } = await setup();
    await w.ready(app, run.runId);
    const result = await app.result("request.send", { playground: id, request: spec });
    expect(result).toEqual(answer);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.port).toBe(w.portOf(id));
    expect(calls[0]?.request).toEqual(spec);
    await w.dispose();
  });

  it("[DESKTOP-REQUEST-PANEL-06] 服务启动中、重载中或已停止：不发请求，结果是 not-ready", async () => {
    const { w, app, id, run, calls } = await setup();
    // 启动中：就绪之前
    expect(await app.result("request.send", { playground: id, request: spec })).toMatchObject({
      outcome: "failed",
      reason: "not-ready",
    });
    await w.ready(app, run.runId);
    await app.result("run.stop", { runId: run.runId });
    expect(await app.result("request.send", { playground: id, request: spec })).toMatchObject({
      outcome: "failed",
      reason: "not-ready",
    });
    expect(calls).toHaveLength(0);
    await w.dispose();
  });

  it("[DESKTOP-REQUEST-PANEL-08] 发出的请求记在项目里，之后读得回来；没发过是 null；没发出去的不记", async () => {
    const { w, app, id, run } = await setup();
    expect(await app.result("request.getLast", { playground: id })).toBeNull();
    // 没就绪，没发出去：不记
    await app.result("request.send", { playground: id, request: spec });
    expect(await app.result("request.getLast", { playground: id })).toBeNull();
    await w.ready(app, run.runId);
    await app.result("request.send", { playground: id, request: spec });
    expect(await app.result("request.getLast", { playground: id })).toEqual(spec);
    await w.dispose();
  });

  it("找不到的项目：PLAYGROUND_NOT_FOUND", async () => {
    const { w, app } = await setup();
    for (const method of ["request.send", "request.getLast"] as const) {
      expect(await app.errorCode(method, { playground: "nope", request: spec })).toBe(
        "PLAYGROUND_NOT_FOUND",
      );
    }
    await w.dispose();
  });
});

describe("请求面板的请求算一次空闲活动", { timeout: 30_000 }, () => {
  async function advanceTo(w: RunWorld, origin: number, offsetMs: number): Promise<void> {
    while (w.clock.now() < origin + offsetMs) {
      await w.clock.advance(Math.min(60_000, origin + offsetMs - w.clock.now()));
      for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
    }
  }

  it("[DESKTOP-REQUEST-PANEL-13] 命令行持有的服务空闲 29 分钟后，从应用发一个请求：计时归零，再过 30 分钟内不因空闲停止", async () => {
    const { w, app, id, run } = await setup(cliOwner);
    const origin = w.clock.now();
    await w.ready(app, run.runId);

    await advanceTo(w, origin, 29 * MIN);
    await app.result("request.send", { playground: id, request: spec });
    // 原来的 30 分钟到点：因为请求归了零，没有停止
    await advanceTo(w, origin, 30 * MIN + 5_000);
    expect(await w.stateOf(app, run.runId)).toBe("ready");
    await advanceTo(w, origin, 58 * MIN);
    expect(await w.stateOf(app, run.runId)).toBe("ready");
    // 从请求那刻起满 30 分钟才停
    await advanceTo(w, origin, 59 * MIN + 10_000);
    await w.until(async () => (await w.stateOf(app, run.runId)) === "stopped");
    await w.dispose();
  });
});
