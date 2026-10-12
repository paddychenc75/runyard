import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { supervisorFileSchema } from "@runyard/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { createPlatformDiscoveryStore, discoveryFilePath } from "./discovery-file.ts";
import { makeShortHome, platformAt } from "./process-harness.test.ts";

const sample = {
  formatVersion: 1 as const,
  pid: 4242,
  startedAt: 1_700_000_000_000,
  endpoint: "/tmp/x.sock",
  token: "ab".repeat(32),
  protocol: 1,
  minClientProtocol: 1,
  version: "1.0.0",
  build: "1.0.0+abc",
  host: "node" as const,
  execPath: "/usr/bin/node",
};

const homes: Array<() => void> = [];
afterEach(() => {
  for (const remove of homes.splice(0)) remove();
});

async function setup() {
  const made = makeShortHome();
  homes.push(made.remove);
  const platform = platformAt(made.home);
  const path = discoveryFilePath(platform.paths.stateDir);
  await platform.fs.makeDir(platform.paths.stateDir);
  await platform.fs.makeDir(absDir(path));
  return { path, store: createPlatformDiscoveryStore(platform) };
}

// 发现文件所在的 run 目录
function absDir(path: string) {
  return dirname(path) as ReturnType<typeof discoveryFilePath>;
}

describe("发现文件的写入", () => {
  it("[SUPERVISOR-LIFECYCLE-11] 写出的文件权限是 600，内容符合格式，没有临时文件残留", async () => {
    const { path, store } = await setup();
    await store.write(sample);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(supervisorFileSchema.parse(JSON.parse(readFileSync(path, "utf8")))).toEqual(sample);
    expect(readdirSync(dirname(path))).toEqual(["supervisor.json"]);
  });

  it("覆盖旧文件是整体替换，新内容完整、权限仍是 600", async () => {
    const { path, store } = await setup();
    await store.write(sample);
    await store.write({ ...sample, token: "cd".repeat(32) });
    expect(JSON.parse(readFileSync(path, "utf8")).token).toBe("cd".repeat(32));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readdirSync(dirname(path))).toEqual(["supervisor.json"]);
  });

  it("写入不合格式的内容会被拒绝，且不留下任何文件", async () => {
    const { path, store } = await setup();
    await expect(store.write({ ...sample, token: "short" })).rejects.toThrow();
    expect(existsSync(path)).toBe(false);
    expect(readdirSync(dirname(path))).toEqual([]);
  });

  it("remove：文件不在也不报错", async () => {
    const { path, store } = await setup();
    await store.remove();
    await store.write(sample);
    await store.remove();
    expect(existsSync(path)).toBe(false);
  });
});
