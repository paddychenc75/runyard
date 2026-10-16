import { absPath } from "@runyard/platform";
import { TOOLCHAIN_FILE_VERSION, type ToolchainFile } from "@runyard/protocol";
import { createFakePlatform } from "@runyard/testing";
import { describe, expect, it } from "vitest";
import { createSettingsStore, settingsFilePath } from "./settings-store.ts";
import { createToolchainStore, toolchainFilePath } from "./toolchain-store.ts";

const entries: ToolchainFile["entries"] = {
  global: {
    checkedAt: 1000,
    tools: [{ tool: "node", status: "found", version: "24.21.0", path: "/bin/node" }],
  },
};

function setup() {
  const fake = createFakePlatform();
  const store = createToolchainStore({ platform: fake.platform, now: () => fake.clock.now() });
  return { fake, store, path: toolchainFilePath(fake.platform) };
}

describe("toolchain.json 的读写", () => {
  it("写出再读回；经 writeAtomic 落盘，带当前格式版本", async () => {
    const { fake, store, path } = setup();
    await store.save(entries);
    expect(JSON.parse(fake.fs.readFile(path))).toMatchObject({
      formatVersion: TOOLCHAIN_FILE_VERSION,
    });
    expect(await store.load()).toEqual(entries);
  });

  it("更新版本写的 toolchain.json：不读、不写，文件原样", async () => {
    const { fake, store, path } = setup();
    const newer = JSON.stringify({ formatVersion: 9, entries: {} });
    fake.fs.writeFile(path, newer);
    expect(await store.load()).toBeUndefined();
    await store.save(entries);
    expect(fake.fs.readFile(path)).toBe(newer);
  });

  it("坏文件改名留存，当作没有缓存", async () => {
    const { fake, store, path } = setup();
    fake.fs.writeFile(path, "garbage");
    expect(await store.load()).toBeUndefined();
    expect(fake.fs.exists(path)).toBe(false);
    const dir = absPath(path.slice(0, path.lastIndexOf("toolchain.json") - 1));
    expect(fake.fs.list(dir).some((name) => name.includes("toolchain.json.corrupt-"))).toBe(true);
  });
});

describe("settings.json 的读-改-写", () => {
  it("同一进程里同时发起的 set 排队执行：每个改动都在，不丢失更新", async () => {
    const fake = createFakePlatform();
    const store = createSettingsStore({
      platform: fake.platform,
      now: () => fake.clock.now(),
      log: () => {},
    });
    await Promise.all([
      store.set({ updateCheck: false }),
      store.set({ cliIdleStopMinutes: 5 }),
      store.set({ scriptAutoRun: false }),
    ]);
    expect(JSON.parse(fake.fs.readFile(settingsFilePath(fake.platform)))).toEqual({
      formatVersion: 1,
      updateCheck: false,
      cliIdleStopMinutes: 5,
      scriptAutoRun: false,
    });
  });
});
