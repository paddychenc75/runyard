import { expect, it } from "vitest";
import { RunWorld } from "./run-harness.test.ts";
import { World } from "./supervisor-harness.test.ts";

// 关闭时要等后台还在写的东西收尾（启动时的资源库扫描、工具检测缓存）：否则进程测试清理临时目录时它还在往里写，报 ENOTEMPTY（#216、#227）。

it("关闭管理进程会等启动时的资源库扫描结束", async () => {
  const world = new World();
  const { fs } = world.fake.platform;
  const realList = fs.listDirs.bind(fs);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let scanStarted = false;
  fs.listDirs = async (dir) => {
    scanStarted = true;
    await gate;
    return realList(dir);
  };

  const handle = await world.start();
  // 扫描不挡着启动：启动返回时它可能还卡在文件系统上
  for (let i = 0; i < 50 && !scanStarted; i++) await new Promise((r) => setTimeout(r, 2));
  expect(scanStarted).toBe(true);

  let shutdownDone = false;
  const shutdown = handle.api.shutdown("user").then(() => {
    shutdownDone = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(shutdownDone).toBe(false);

  release();
  await shutdown;
  await world.dispose();
});

// 关闭管理进程时，后台写的工具检测缓存（toolchain.json）要先落盘再返回：
it("关闭管理进程会等工具检测缓存写完", async () => {
  const w = new RunWorld();
  await w.start();
  const { fs } = w.world.fake.platform;
  const realWrite = fs.writeAtomic.bind(fs);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writeStarted = false;
  let writeDone = false;
  fs.writeAtomic = async (path, text) => {
    if (String(path).endsWith("toolchain.json")) {
      writeStarted = true;
      await gate;
      await realWrite(path, text);
      writeDone = true;
      return;
    }
    await realWrite(path, text);
  };

  const toolchain = await w.module.toolchain();
  await w.drive(toolchain.check({ requires: { node: { version: ">=20" } } }));
  await w.until(async () => writeStarted);

  let shutdownDone = false;
  const shutdown = w.handle.api.shutdown("user").then(() => {
    shutdownDone = true;
  });
  // 写还没放行，关闭不能先返回
  await w.clock.advance(1000);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(shutdownDone).toBe(false);

  release();
  await w.drive(shutdown);
  expect(writeDone).toBe(true);
  await w.dispose();
});
