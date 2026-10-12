import { supervisorFileSchema } from "@runyard/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { World } from "./supervisor-harness.test.ts";
import { tokenBytes } from "./test-client.ts";

let world = new World();
afterEach(() => world.dispose());

describe("启动", () => {
  it("[SUPERVISOR-LIFECYCLE-01] 已经有管理进程持锁时第二个启动者拿到 BUSY，且不碰第一个的发现文件", async () => {
    world = new World();
    const first = await world.start();
    const logBefore = [...world.discovery.log];
    await expect(world.start()).rejects.toMatchObject({ error: { code: "BUSY" } });
    // 失败的启动者在拿到锁之前什么都不许动：不删、不写发现文件
    expect(world.discovery.log).toEqual(logBefore);
    expect(world.discovery.file?.token).toBe(first.token);
    // 第一个照常服务
    const client = await world.session(first);
    expect(await client.request("ping")).toMatchObject({ ok: true });
  });

  it("[SUPERVISOR-LIFECYCLE-11] 监听完成后发现文件写好，含进程号、连接点、口令、版本、构建标识、启动者和可执行文件", async () => {
    world = new World();
    const handle = await world.start({ host: "electron", execPath: "/Applications/Runyard.app/x" });
    const file = world.discovery.file;
    expect(supervisorFileSchema.safeParse(file).success).toBe(true);
    expect(file).toMatchObject({
      formatVersion: 1,
      pid: process.pid,
      endpoint: world.fake.platform.ipc.endpoint(),
      token: handle.token,
      protocol: 1,
      minClientProtocol: 1,
      version: "0.0.0-test",
      build: "0.0.0-test+aaaa",
      host: "electron",
      execPath: "/Applications/Runyard.app/x",
      startedAt: world.clock.now(),
    });
    expect(handle.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("每次启动口令都是新的随机数", async () => {
    world = new World();
    const first = await world.start();
    await first.api.shutdown("user");
    const second = await world.start();
    expect(second.token).not.toBe(first.token);
  });

  it("先删上次留下的发现文件，崩溃清理在写发现文件之前，客户端此时还拿不到口令", async () => {
    world = new World();
    world.discovery.file = { stale: true } as never;
    const seen: unknown[] = [];
    await world.start({
      extend: () => ({
        recoverCrashedRuns: async () => {
          seen.push(world.discovery.file);
        },
      }),
    });
    expect(seen).toEqual([undefined]);
    expect(world.discovery.log).toEqual(["remove", "write"]);
  });

  it("崩溃清理失败不会让管理进程起不来，错误进日志", async () => {
    world = new World();
    const lines: string[] = [];
    const handle = await world.start({
      log: (line) => lines.push(line),
      extend: () => ({
        recoverCrashedRuns: async () => {
          throw new Error("cannot read run records");
        },
      }),
    });
    expect(lines.join("\n")).toContain("cannot read run records");
    const client = await world.session(handle);
    expect(await client.request("ping")).toMatchObject({ ok: true });
  });

  it("写发现文件失败：启动失败并放掉锁，下一个启动者可以接着来", async () => {
    world = new World();
    const broken = {
      ...world.discovery,
      write: async () => {
        throw new Error("disk full");
      },
    };
    await expect(world.start({ discovery: broken })).rejects.toThrow("disk full");
    const handle = await world.start();
    const client = await world.session(handle);
    expect(await client.request("ping")).toMatchObject({ ok: true });
    expect(tokenBytes(handle.token).length).toBe(32);
  });
});
