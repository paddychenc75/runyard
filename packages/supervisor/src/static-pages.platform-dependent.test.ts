import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { absPath, getPlatform, type Platform } from "@runyard/platform";
import type { RunSnapshot } from "@runyard/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pump } from "./library-harness.test.ts";
import { makeShortHome, waitUntil } from "./process-harness.test.ts";
import { createRunModule } from "./run-module.ts";
import { startSupervisor } from "./start-supervisor.ts";
import type { SupervisorHandle } from "./supervisor-options.ts";
import { TestClient, tokenBytes } from "./test-client.ts";

// 端到端：真实管理进程（跑在测试进程里）、真实平台、仓库里真实的 html 模板和 static 运行器，临时主目录。
// 项目的文件夹由模板的 files/ 复制而来。绝不使用 ~/Runyard 和 ~/.runyard。

const repoTemplates = fileURLToPath(new URL("../../../templates", import.meta.url));

let home: ReturnType<typeof makeShortHome>;
let outside: string;
let platform: Platform;
let handle: SupervisorHandle;
let project: string;
let spawned = 0;
const pumps: Pump[] = [];

beforeEach(async () => {
  home = makeShortHome();
  outside = realpathSync(mkdtempSync(join(tmpdir(), "ry-html-")));
  const base = getPlatform({ home: home.home, profile: undefined });
  // 数静态运行有没有起过子进程
  platform = {
    ...base,
    exec: {
      ...base.exec,
      spawn: (spec) => {
        spawned += 1;
        return base.exec.spawn(spec);
      },
    },
  };
  spawned = 0;
  project = join(base.paths.defaultLibrary, "page-demo");
  mkdirSync(join(project, ".runyard"), { recursive: true });
  cpSync(join(repoTemplates, "builtin", "html", "files"), project, { recursive: true });
  writeFileSync(
    join(project, ".runyard", "playground.json"),
    JSON.stringify({
      formatVersion: 1,
      id: "01HTML",
      template: { id: "html", source: "builtin", appVersion: "0.0.0" },
      runner: "static",
      requires: {},
      toolchainAtCreate: {},
      createdAt: 1,
      createdBy: { kind: "user" },
      autoClean: { enabled: false },
      trust: "trusted",
    }),
  );
  const templateData = {
    builtinDir: absPath(join(repoTemplates, "builtin")),
    runnersDir: absPath(join(repoTemplates, "runners")),
    toolsDir: absPath(join(repoTemplates, "tools")),
  };
  handle = await startSupervisor({
    platform,
    identity: {
      protocol: 1,
      minClientProtocol: 1,
      version: "0.0.0-it",
      build: "0.0.0-it+html",
      startedBy: "cli",
    },
    templateData,
    host: "node",
    execPath: process.execPath,
    extend: (api) => createRunModule(api, { templateData }),
  });
});

afterEach(async () => {
  for (const pump of pumps.splice(0)) {
    pump.stop();
    pump.client.destroy();
  }
  await handle.api.shutdown("user");
  home.remove();
  rmSync(outside, { recursive: true, force: true }); // delete-allow: 测试自己建的临时目录
});

async function open(): Promise<Pump> {
  const client = await TestClient.connect(platform);
  await client.handshake(platform, tokenBytes(handle.token), { kind: "cli" });
  const pump = new Pump(client);
  pumps.push(pump);
  await pump.result("events.subscribe", { topics: ["run"] });
  return pump;
}

async function startPage(pump: Pump): Promise<RunSnapshot & { port: number }> {
  // 启动时的资源库扫描不挡着接受连接，所以第一次请求可能还找不到项目
  return waitUntil(async () => {
    const response = await pump.call("run.start", {
      playground: "page-demo",
      owner: { kind: "cli", command: "runyard run" },
      wait: "ready",
    });
    return response.ok === true ? (response.result as RunSnapshot & { port: number }) : undefined;
  }, "page ready");
}

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, path }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
      );
    })
      .on("error", reject)
      .end();
  });
}

/** 连上 SSE，返回“收到下一个 data 行”的 promise 和关闭函数 */
function subscribe(port: number): Promise<{ next: Promise<string>; close: () => void }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: "/__runyard/reload" }, (res) => {
      const next = new Promise<string>((done) => {
        let text = "";
        res.on("data", (chunk: Buffer) => {
          text += chunk.toString("utf8");
          const line = text.split("\n").find((l) => l.startsWith("data:"));
          if (line !== undefined) done(line);
        });
      });
      resolve({ next, close: () => req.destroy() });
    });
    req.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") reject(error);
    });
    req.end();
  });
}

describe("html 模板与静态页面运行器（真实管理进程）", () => {
  it("[TEMPLATES-RUNNERS-08] 没有子进程：状态到 ready、有端口、计入“运行中”，管理进程没起过任何子进程", async () => {
    const pump = await open();
    const run = await startPage(pump);
    expect(run.state).toBe("ready");
    expect(run.port).toBeGreaterThan(0);
    expect(spawned).toBe(0);
    const counted = pump.events.filter((e) => e.event === "run.state");
    expect(counted.some((e) => (e.data as { runningCount: number }).runningCount === 1)).toBe(true);
    const page = await get(run.port, "/");
    expect(page.status).toBe(200);
    expect(page.body).toContain("EventSource");
  }, 30_000);

  it("监听地址只有回环（loopbackOnly）", async () => {
    const pump = await open();
    const run = await startPage(pump);
    expect(await platform.ports.loopbackOnly(run.port)).toBe(true);
    expect(await platform.ports.isFree(run.port)).toBe("in-use");
  }, 30_000);

  it("创建、启动、读页面、改文件后刷新事件到达、停止后端口可绑定", async () => {
    const pump = await open();
    const run = await startPage(pump);
    const events = await subscribe(run.port);
    writeFileSync(join(project, "index.html"), "<html><body><h1>B</h1></body></html>");
    expect(await events.next).toBe("data: reload");
    expect((await get(run.port, "/")).body).toContain("<h1>B</h1>");
    events.close();

    await pump.result("run.stop", { runId: run.runId });
    expect(await platform.ports.isFree(run.port)).toBe("free");
  }, 30_000);

  it("[TEMPLATES-RUNNERS-10] 指向项目文件夹外的符号链接被拒绝，指向里面的可以", async () => {
    writeFileSync(join(outside, "secret.txt"), "top-secret");
    symlinkSync(join(outside, "secret.txt"), join(project, "leak.txt"));
    symlinkSync(join(outside, ""), join(project, "leakdir"));
    symlinkSync(join(project, "style.css"), join(project, "alias.css"));
    symlinkSync(join(project, ".runyard", "playground.json"), join(project, "meta.json"));
    const pump = await open();
    const run = await startPage(pump);
    for (const path of ["/leak.txt", "/leakdir/secret.txt", "/leakdir/"]) {
      const response = await get(run.port, path);
      expect([403, 404], path).toContain(response.status);
      expect(response.body, path).not.toContain("top-secret");
    }
    expect((await get(run.port, "/meta.json")).status).toBe(404);
    expect((await get(run.port, "/alias.css")).status).toBe(200);
  }, 30_000);

  it("[TEMPLATES-RUNNERS-11] 停止返回时端口已可重新绑定，已建立的连接已断开", async () => {
    const pump = await open();
    const run = await startPage(pump);
    // 先等 SSE 连接真的建立，再停止
    const { closed } = await new Promise<{ closed: Promise<void> }>((resolve, reject) => {
      const probe = request(
        { host: "127.0.0.1", port: run.port, path: "/__runyard/reload" },
        (res) => {
          res.resume(); // 不读数据流就收不到 close
          resolve({ closed: new Promise<void>((done) => res.on("close", done)) });
        },
      );
      probe.on("error", reject);
      probe.end();
    });
    const stoppedAt = Date.now();
    await pump.result("run.stop", { runId: run.runId });
    expect(Date.now() - stoppedAt).toBeLessThan(3000);
    expect(await platform.ports.isFree(run.port)).toBe("free");
    await closed;
  }, 30_000);
});
