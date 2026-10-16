import { afterEach, describe, expect, it } from "vitest";
import { methodFailure } from "./method-failure.ts";
import { World } from "./supervisor-harness.test.ts";

let world = new World();
afterEach(() => world.dispose());

describe("方法分发", () => {
  it("未知方法名回 NOT_SUPPORTED，且错误里只有代码和参数", async () => {
    world = new World();
    const client = await world.session(await world.start());
    const response = await client.request("no.such.method");
    expect(response).toMatchObject({ ok: false, error: { code: "NOT_SUPPORTED", params: {} } });
    expect(Object.keys((response as { error: object }).error).sort()).toEqual([
      "code",
      "debug",
      "params",
    ]);
  });

  it("登记了但还没有处理函数的方法（等 #40、#41）和只占名字的方法都回 NOT_SUPPORTED", async () => {
    world = new World();
    const client = await world.session(await world.start());
    expect(await client.request("run.start", {})).toMatchObject({
      ok: false,
      error: { code: "NOT_SUPPORTED" },
    });
    expect(await client.request("request.send", {})).toMatchObject({
      ok: false,
      error: { code: "NOT_SUPPORTED" },
    });
  });

  it("入参不合登记表的 zod 定义回 USAGE，处理函数不被调用", async () => {
    world = new World();
    let called = 0;
    const client = await world.session(
      await world.start({
        extend: () => ({
          handlers: {
            "run.get": () => {
              called++;
              return {} as never;
            },
          },
        }),
      }),
    );
    const response = await client.request("run.get", { wrong: 1 });
    expect(response).toMatchObject({ ok: false, error: { code: "USAGE", params: {} } });
    expect(called).toBe(0);
    expect(
      await client.request("supervisor.shutdown", { ifIdle: "yes", reason: "upgrade" }),
    ).toMatchObject({
      ok: false,
      error: { code: "USAGE" },
    });
  });

  it("[PROTOCOL-HANDSHAKE-20] params 里多出一个不认识的字段：请求照常处理，多余字段被忽略", async () => {
    world = new World();
    const seen: unknown[] = [];
    const client = await world.session(
      await world.start({
        extend: () => ({
          handlers: {
            "run.get": (params) => {
              seen.push(params);
              throw methodFailure("RUN_NOT_FOUND", { runId: params.runId }, "test");
            },
          },
        }),
      }),
    );
    const response = await client.request("run.get", {
      runId: "r1",
      fromTheFuture: true,
    });
    expect(seen).toEqual([{ runId: "r1" }]);
    expect(response).toMatchObject({ ok: false, error: { code: "RUN_NOT_FOUND" } });
    expect(await client.request("ping", { alsoNew: 1 })).toMatchObject({ ok: true, result: {} });
  });

  it("[PROTOCOL-HANDSHAKE-15] 处理函数抛出的协议错误原样成为 ok:false 的响应，没有给人看的句子字段", async () => {
    world = new World();
    const client = await world.session(
      await world.start({
        extend: () => ({
          handlers: {
            "run.get": () => {
              throw methodFailure("NAME_EXISTS", { name: "demo" }, "name already used");
            },
          },
        }),
      }),
    );
    const response = (await client.request("run.get", {
      runId: "r1",
    })) as { ok: boolean; error: Record<string, unknown> };
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("NAME_EXISTS");
    expect(response.error.params).toEqual({ name: "demo" });
    expect(Object.keys(response.error)).not.toContain("message");
    expect(Object.keys(response.error)).not.toContain("hint");
  });

  it("处理函数的出参不合登记表：回 INTERNAL，不把不合规的数据发出去", async () => {
    world = new World();
    const client = await world.session(
      await world.start({
        extend: () => ({ handlers: { "run.stopAll": () => ({ stopped: "no" }) as never } }),
      }),
    );
    const response = await client.request("run.stopAll", {});
    expect(response).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(JSON.stringify(response)).not.toContain('"stopped"');
  });

  it("别的异常是缺陷：回 INTERNAL，debug 只带一句英文", async () => {
    world = new World();
    const client = await world.session(
      await world.start({
        extend: () => ({
          handlers: {
            "toolchain.doctor": () => {
              throw new Error("boom");
            },
          },
        }),
      }),
    );
    expect(await client.request("toolchain.doctor", {})).toMatchObject({
      ok: false,
      error: { code: "INTERNAL", params: {}, debug: "boom" },
    });
  });

  it("同一连接上并发的请求各自按 id 返回，慢的不挡快的", async () => {
    world = new World();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = await world.session(
      await world.start({
        extend: () => ({
          handlers: {
            "toolchain.doctor": async () => {
              await gate;
              return { tools: [] };
            },
          },
        }),
      }),
    );
    const slow = client.send("toolchain.doctor", {});
    const fast = await client.request("ping");
    expect(fast).toMatchObject({ ok: true });
    release();
    const slowResponse = (await client.next()) as { id: number; ok: boolean };
    expect(slowResponse).toMatchObject({ id: slow, ok: true });
  });

  it("supervisor 自己的方法不许被后来的处理函数替换", async () => {
    world = new World();
    await expect(
      world.start({ extend: () => ({ handlers: { ping: () => ({}) } }) }),
    ).rejects.toThrow(/cannot be replaced/);
    // 启动失败要放掉锁：同一个现场可以接着再起一个
    const again = await world.start();
    expect(again.endpoint).toBeTruthy();
  });
});
