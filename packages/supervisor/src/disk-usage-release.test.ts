import { afterEach, expect, it, vi } from "vitest";
import { LibraryWorld } from "./library-harness.test.ts";

let world = new LibraryWorld();
afterEach(() => world.dispose());

it.each(["rename", "trash"])(
  "[LIBRARY-DISK-USAGE-18] [LIBRARY-DISK-USAGE-20] %s 等磁盘监听释放后才移动目录",
  async (operation) => {
    world = new LibraryWorld();
    const platform = world.world.fake.platform;
    const watch = platform.watch;
    let entered = () => {};
    let release = () => {};
    const closing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(platform, "watch").mockImplementation(async (path, options, callback) => {
      const handle = await watch(path, options, callback);
      return {
        dispose: async () => {
          if (path === world.at("demo")) {
            entered();
            await blocked;
          }
          await handle.dispose();
        },
      };
    });
    await world.start();
    const client = await world.client(false);
    await world.create(client, "demo");
    const pending = client.call(`playground.${operation}`, { playground: "demo", newName: "next" });
    await closing;
    expect(world.fs.exists(world.at("demo"))).toBe(true);
    expect(world.fs.trashed).toEqual([]);
    release();
    expect(await pending).toMatchObject({ ok: true });
    expect(world.fs.exists(world.at("demo"))).toBe(false);
  },
);

it("[LIBRARY-DISK-USAGE-18] 移动失败恢复原路径监听，仍保留已有大小", async () => {
  world = new LibraryWorld();
  const watches = vi.spyOn(world.world.fake.platform, "watch");
  await world.start();
  const client = await world.client(false);
  await world.create(client, "demo");
  world.fs.lock(world.at("demo"));
  expect(await client.errorCode("playground.rename", { playground: "demo", newName: "next" })).toBe(
    "PATH_LOCKED",
  );
  await vi.waitFor(() =>
    expect(watches.mock.calls.filter(([path]) => path === world.at("demo"))).toHaveLength(2),
  );
});
