import { absPath, type Platform } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { type Clock, createFakePlatform } from "./index.ts";

// 这是“怎样给一次运行写单元测试”的示例（docs/guides/testing.md 引用它）。
// 下面两个函数是示例里的被测代码的替身：真正的运行引擎在 core 里，写法一样——
// 平台和时钟都从参数进来，所以测试可以换成假的。

/** 每 100 毫秒看一次端口，端口被占用就是就绪；超时返回 false */
function waitReady(platform: Platform, clock: Clock, port: number, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const started = clock.now();
    const timer = clock.setInterval(async () => {
      if ((await platform.ports.isFree(port)) === "in-use") {
        clock.clearInterval(timer);
        resolve(true);
      } else if (clock.now() - started >= timeoutMs) {
        clock.clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

async function stop(platform: Platform, proc: { ref: { pid: number; startTime: number } }) {
  await platform.proc.terminate(proc.ref, { mode: "graceful", graceMs: 2000 });
}

describe("示例：服务的启动、就绪和停止", () => {
  const argv = ["node", "server.js"];
  const cwd = absPath("/fake/project");

  it("进程在 1.5 秒后占住端口就是就绪，停止后整棵树为空、端口空出来", async () => {
    const fake = createFakePlatform();
    // 剧本：1.5 秒后监听 7100；先起一个子进程（比如开发服务器的 worker）
    fake.processes.when(argv, {
      listenOn: { port: 7100, atMs: 1500 },
      children: [{ atMs: 0 }],
    });

    const proc = fake.platform.exec.spawn({ argv, cwd, env: {}, stdin: false });
    const ready = waitReady(fake.platform, fake.clock, 7100, 30_000);
    await fake.clock.advance(1500); // 不真的等 1.5 秒
    expect(await ready).toBe(true);

    await stop(fake.platform, proc);
    expect(await fake.platform.proc.members(proc.ref)).toEqual([]);
    expect(await fake.platform.ports.isFree(7100)).toBe("free");
    expect(fake.clock.pendingTimers()).toBe(0);
  });

  it("进程一直不就绪：30 秒到点判超时，进程仍活着", async () => {
    const fake = createFakePlatform();
    const proc = fake.platform.exec.spawn({ argv, cwd, env: {}, stdin: false });
    const ready = waitReady(fake.platform, fake.clock, 7100, 30_000);
    await fake.clock.advance(30_000);
    expect(await ready).toBe(false);
    expect(fake.processes.isAlive(proc.ref)).toBe(true);
  });

  it("进程忽略停止请求：等满 graceMs 后被强制结束", async () => {
    const fake = createFakePlatform();
    fake.processes.when(argv, { ignoresStop: true });
    const proc = fake.platform.exec.spawn({ argv, cwd, env: {}, stdin: false });
    const stopped = stop(fake.platform, proc);
    await fake.clock.advance(2000);
    await stopped;
    expect(fake.processes.alive()).toEqual([]);
  });
});
