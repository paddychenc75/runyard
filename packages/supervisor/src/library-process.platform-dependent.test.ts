import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AbsPath, Platform } from "@runyard/platform";
import { type SupervisorFile, supervisorFileSchema } from "@runyard/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoveryFilePath } from "./discovery-file.ts";
import { Pump } from "./library-harness.test.ts";
import {
  makeShortHome,
  ProcessLedger,
  platformAt,
  type RunningSupervisor,
  waitUntil,
} from "./process-harness.test.ts";
import { TestClient, tokenBytes } from "./test-client.ts";

// 真实的管理进程（单独的 Node 进程）加真实的文件系统，在临时主目录里。
// 这里验证的是单元测试里用假平台、假时钟看不出的东西：真实的 3 秒、真实的 writeAtomic 和改名。

let home: AbsPath;
let removeHome: () => void;
let platform: Platform;
let ledger: ProcessLedger;
const pumps: Pump[] = [];

beforeEach(() => {
  const made = makeShortHome();
  home = made.home;
  removeHome = made.remove;
  platform = platformAt(home);
  ledger = new ProcessLedger(platform);
});

afterEach(async () => {
  for (const pump of pumps.splice(0)) {
    pump.stop();
    pump.client.destroy();
  }
  const leaked = await ledger.reap();
  removeHome();
  expect(leaked).toEqual([]);
});

async function waitReady(running: RunningSupervisor): Promise<SupervisorFile> {
  return waitUntil(() => {
    if (running.hasExited()) throw new Error(`supervisor exited early: ${running.stderr()}`);
    const path = discoveryFilePath(platform.paths.stateDir);
    if (!existsSync(path)) return undefined;
    const parsed = supervisorFileSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.success && parsed.data.pid === running.pid ? parsed.data : undefined;
  }, "the discovery file");
}

async function open(file: SupervisorFile, subscribe: boolean): Promise<Pump> {
  const client = await TestClient.connect(platform);
  await client.handshake(platform, tokenBytes(file.token));
  const pump = new Pump(client);
  pumps.push(pump);
  if (subscribe) await pump.result("events.subscribe", { topics: ["playground"] });
  return pump;
}

// 资源库里放一个已有的项目文件夹：启动时的扫描会把它登记进索引
function seedPlayground(name: string, id: string): string {
  const dir = join(platform.paths.defaultLibrary, name);
  mkdirSync(join(dir, ".runyard"), { recursive: true });
  writeFileSync(join(dir, "index.js"), "console.log(1)\n");
  writeFileSync(
    join(dir, ".runyard", "playground.json"),
    JSON.stringify({
      formatVersion: 1,
      id,
      template: { id: "react19", source: "builtin", appVersion: "0.0.0" },
      runner: "node-server",
      requires: {},
      toolchainAtCreate: {},
      createdAt: 1,
      createdBy: { kind: "user" },
      autoClean: { enabled: false },
      trust: "trusted",
    }),
  );
  return dir;
}

async function shutdown(running: RunningSupervisor, file: SupervisorFile): Promise<void> {
  const pump = await open(file, false);
  await pump.call("supervisor.shutdown", { ifIdle: false, reason: "user" });
  expect(await running.exited).toBe(0);
}

describe("真实进程：资源库与设置", () => {
  it("[LIBRARY-PLAYGROUNDS-16] 一个应用连接收到 releaseRequested 后一直不回报：命令行的改名等满 3 秒后完成，文件夹真的改了名", async () => {
    seedPlayground("demo", "01DEMO");
    const running = ledger.startSupervisor(home);
    const file = await waitReady(running);
    const app = await open(file, true);
    const cli = await open(file, false);
    await waitUntil(
      async () =>
        (await app.result<unknown[]>("playground.list", {})).length > 0 ? true : undefined,
      "the startup scan",
    );
    const started = Date.now();
    const response = await cli.call("playground.rename", { playground: "demo", newName: "demo2" });
    const elapsed = Date.now() - started;
    expect(response).toMatchObject({ ok: true, result: { name: "demo2", id: "01DEMO" } });
    expect(elapsed).toBeGreaterThanOrEqual(2900);
    expect(app.eventsOf("playground.releaseRequested")).toEqual([
      { playgroundId: "01DEMO", reason: "rename" },
    ]);
    expect(
      existsSync(join(platform.paths.defaultLibrary, "demo2", ".runyard", "playground.json")),
    ).toBe(true);
    expect(existsSync(join(platform.paths.defaultLibrary, "demo"))).toBe(false);
    await shutdown(running, file);
  }, 15_000);

  it("命令行与应用同时 settings.set：settings.json 是完整的 JSON，两处改动都在，没有临时文件残留", async () => {
    const running = ledger.startSupervisor(home);
    const file = await waitReady(running);
    const app = await open(file, false);
    const cli = await open(file, false);
    await Promise.all([
      app.result("settings.set", { updateCheck: false }),
      cli.result("settings.set", { cliIdleStopMinutes: 5 }),
      app.result("settings.set", { scriptAutoRun: false }),
      cli.result("settings.set", { urlNewSkipConfirmForBuiltin: true }),
    ]);
    const text = readFileSync(join(platform.paths.stateDir, "settings.json"), "utf8");
    expect(JSON.parse(text)).toEqual({
      formatVersion: 1,
      updateCheck: false,
      cliIdleStopMinutes: 5,
      scriptAutoRun: false,
      urlNewSkipConfirmForBuiltin: true,
    });
    expect(readdirSync(platform.paths.stateDir).filter((name) => name.includes("tmp"))).toEqual([]);
    await shutdown(running, file);
  });

  it("更新版本写的 library.json：只读不写，rescan 与改动类方法报 DATA_FROM_NEWER_VERSION，文件原样", async () => {
    seedPlayground("demo", "01DEMO");
    const newer = JSON.stringify({
      formatVersion: 9,
      root: platform.paths.defaultLibrary,
      playgrounds: [],
    });
    mkdirSync(join(platform.paths.stateDir, "state"), { recursive: true });
    writeFileSync(join(platform.paths.stateDir, "state", "library.json"), newer);
    const running = ledger.startSupervisor(home);
    const file = await waitReady(running);
    const app = await open(file, false);
    expect(await app.errorCode("library.rescan", {})).toBe("DATA_FROM_NEWER_VERSION");
    expect(await app.errorCode("clean.keep", { playgroundId: "none" })).toBe(
      "PLAYGROUND_NOT_FOUND",
    );
    expect(readFileSync(join(platform.paths.stateDir, "state", "library.json"), "utf8")).toBe(
      newer,
    );
    await shutdown(running, file);
  });
});
