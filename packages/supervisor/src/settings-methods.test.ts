import { dirname } from "node:path";
import { absPath } from "@runyard/platform";
import { afterEach, describe, expect, it } from "vitest";
import { LibraryWorld } from "./library-harness.test.ts";

let lw = new LibraryWorld();
afterEach(() => lw.dispose());

async function setup(before?: () => void) {
  lw = new LibraryWorld();
  before?.();
  await lw.start();
  return lw.client();
}

const readSettings = () => JSON.parse(lw.fs.readFile(lw.settingsPath())) as Record<string, unknown>;

describe("settings.get / settings.set", () => {
  it("没有文件时取默认值，get 不创建文件", async () => {
    const app = await setup();
    const settings = await app.result<Record<string, unknown>>("settings.get", {});
    expect(settings).toMatchObject({
      packageManager: "auto",
      scriptAutoRun: true,
      cliIdleStopMinutes: 30,
      ports: { min: 7100, max: 7999 },
      updateCheck: true,
      confirmCloseRunningTab: true,
    });
    expect(lw.fs.exists(lw.settingsPath())).toBe(false);
  });

  it("set 只写传来的字段，返回改后的全部设置，发出 settings.changed；未知字段原样保留", async () => {
    const app = await setup(() => {
      lw.fs.writeFile(lw.settingsPath(), JSON.stringify({ formatVersion: 1, theme: "dark" }));
    });
    const after = await app.result<{ updateCheck: boolean; cliIdleStopMinutes: number }>(
      "settings.set",
      {
        updateCheck: false,
      },
    );
    expect(after).toMatchObject({ updateCheck: false, cliIdleStopMinutes: 30 });
    expect(readSettings()).toEqual({ formatVersion: 1, theme: "dark", updateCheck: false });
    expect(await app.waitForEvent("settings.changed")).toEqual({});
  });

  it("旧文件里没有 confirmCloseRunningTab 按 true 读，写 false 后读回 false，不升 formatVersion", async () => {
    const app = await setup(() => {
      lw.fs.writeFile(lw.settingsPath(), JSON.stringify({ formatVersion: 1, updateCheck: false }));
    });
    expect(await app.result("settings.get", {})).toMatchObject({ confirmCloseRunningTab: true });
    await app.result("settings.set", { confirmCloseRunningTab: false });
    expect(await app.result("settings.get", {})).toMatchObject({ confirmCloseRunningTab: false });
    expect(readSettings()).toMatchObject({ formatVersion: 1, confirmCloseRunningTab: false });
  });

  it("ports.min 大于 ports.max 报 USAGE，文件不动", async () => {
    const app = await setup();
    expect(await app.errorCode("settings.set", { ports: { min: 8000, max: 7100 } })).toBe("USAGE");
    expect(lw.fs.exists(lw.settingsPath())).toBe(false);
  });

  it("更新版本写的 settings.json：get 照常读（只读视图），set 报 DATA_FROM_NEWER_VERSION，文件不改写", async () => {
    const newer = JSON.stringify({ formatVersion: 9, updateCheck: false, future: true });
    const app = await setup(() => lw.fs.writeFile(lw.settingsPath(), newer));
    expect(await app.result("settings.get", {})).toMatchObject({ updateCheck: false });
    const response = await app.call("settings.set", { scriptAutoRun: false });
    expect(response).toMatchObject({
      ok: false,
      error: {
        code: "DATA_FROM_NEWER_VERSION",
        params: { file: "settings.json", found: 9, supported: 1 },
      },
    });
    expect(lw.fs.readFile(lw.settingsPath())).toBe(newer);
  });

  it("坏的 settings.json 改名留存，回到默认值，下一次 set 写出新文件", async () => {
    const app = await setup(() => lw.fs.writeFile(lw.settingsPath(), "{not json"));
    expect(await app.result("settings.get", {})).toMatchObject({ packageManager: "auto" });
    const kept = lw.fs
      .list(absPath(dirname(lw.settingsPath())))
      .filter((name) => name.includes("settings.json.corrupt-"));
    expect(kept).toHaveLength(1);
    expect(lw.fs.exists(lw.settingsPath())).toBe(false);
    await app.result("settings.set", { updateCheck: false });
    expect(readSettings()).toMatchObject({ formatVersion: 1, updateCheck: false });
    expect(lw.logs.some((line) => line.startsWith("settings.json was corrupt"))).toBe(true);
  });

  it("命令行与应用同时 set 不同字段：两个改动都在，文件是完整的 JSON（读-改-写不交错）", async () => {
    const app = await setup();
    const cli = await lw.client(false);
    const responses = await Promise.all([
      app.call("settings.set", { updateCheck: false }),
      cli.call("settings.set", { cliIdleStopMinutes: 5 }),
      app.call("settings.set", { scriptAutoRun: false }),
    ]);
    expect(responses.every((response) => response.ok === true)).toBe(true);
    expect(readSettings()).toEqual({
      formatVersion: 1,
      updateCheck: false,
      cliIdleStopMinutes: 5,
      scriptAutoRun: false,
    });
  });

  it("命令行与应用同时创建不同项目：索引里两个都在，文件完整", async () => {
    const app = await setup();
    const cli = await lw.client(false);
    const [a, b] = await Promise.all([
      app.call("playground.create", {
        template: "react19",
        name: "from-app",
        createdBy: { kind: "user" },
      }),
      cli.call("playground.create", {
        template: "react19",
        name: "from-cli",
        createdBy: { kind: "cli" },
      }),
    ]);
    expect([a.ok, b.ok]).toEqual([true, true]);
    const index = JSON.parse(lw.fs.readFile(lw.indexPath())) as { playgrounds: { path: string }[] };
    expect(index.playgrounds.map((entry) => entry.path).sort()).toEqual([
      lw.at("from-app"),
      lw.at("from-cli"),
    ]);
  });
});
