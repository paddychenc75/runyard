import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { absPath, getPlatform } from "@runyard/platform";
import type { LogEntry } from "@runyard/protocol";
import { registerSpawned } from "@runyard/testing";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createReadinessProbe } from "./readiness-probe.ts";
import type { RunClock } from "./run-clock.ts";
import { RunEngine } from "./run-engine.ts";
import { buildRunEnv } from "./run-env.ts";
import type { ReadinessContext, RunPlan } from "./run-types.ts";

// 真实的就绪探测：本测试自己在动态端口上起本机 HTTP 服务，用完关掉；
// 不碰 ~/Runyard 和 ~/.runyard，不联网（只连 127.0.0.1）。

const root = realpathSync(mkdtempSync(join(tmpdir(), "runyard-ready-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const realClock: RunClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => Number(setTimeout(callback, ms)[Symbol.toPrimitive]()),
  clearTimeout: (id) => clearTimeout(id),
};

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function listen(server: Server): Promise<number> {
  servers.push(server);
  server.closeAllConnections?.();
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port));
  });
}

function context(port: number, ready: RunPlan["ready"]): ReadinessContext {
  return {
    runId: "r",
    signal: new AbortController().signal,
    onLine: () => () => undefined,
    plan: {
      argv: [],
      cwd: absPath(root),
      env: {},
      stdin: false,
      stop: { mode: "graceful", graceMs: 2000 },
      port,
      ...(ready === undefined ? {} : { ready }),
    },
  };
}

const probe = createReadinessProbe({ clock: realClock, pollMs: 20 });
const http = { http: { path: "/" }, slowAfterMs: 30000 } as const;

describe("真实的就绪探测", () => {
  it("[RUN-PORTS-14] 端口先开、页面后好：port 判断立刻就绪，http 判断要等到第一个 HTTP 响应", async () => {
    // 先接受连接，400 毫秒后才应答：像 Next 先开端口、后编译页面
    const port = await listen(
      createServer((_request, response) => {
        setTimeout(() => response.end("ok"), 400);
      }),
    );
    const started = Date.now();
    await probe.waitReady(context(port, { port: {}, slowAfterMs: 30000 }));
    const portReadyAfter = Date.now() - started;
    await probe.waitReady(context(port, http));
    const httpReadyAfter = Date.now() - started;
    expect(portReadyAfter).toBeLessThan(300);
    expect(httpReadyAfter).toBeGreaterThanOrEqual(350);
  });

  it("低于 500 的任何响应都算就绪：先 503 后 404", async () => {
    let hits = 0;
    const port = await listen(
      createServer((_request, response) => {
        hits += 1;
        response.statusCode = hits < 3 ? 503 : 404;
        response.end();
      }),
    );
    await probe.waitReady(context(port, http));
    expect(hits).toBe(3);
  });

  it("[RUN-PORTS-13] 环境里设了 http_proxy 且进程启用了 Node 的环境变量代理：探测直连 127.0.0.1，不经代理，不因代理的 503 误判", async () => {
    let proxyHits = 0;
    const proxyPort = await listen(
      createServer((_request, response) => {
        proxyHits += 1;
        response.statusCode = 503;
        response.end();
      }),
    );
    const port = await listen(createServer((_request, response) => response.end("origin")));
    const probeIo = pathToFileURL(join(import.meta.dirname, "probe-io.ts")).href;
    const script = join(root, "probe-child.mjs");
    writeFileSync(
      script,
      `import { request } from 'node:http';
import { nodeProbeIo } from ${JSON.stringify(probeIo)};
const control = await new Promise((resolve) => {
  request({ host: '127.0.0.1', port: ${port}, path: '/' }, (r) => { r.resume(); resolve(r.statusCode); })
    .on('error', () => resolve(null)).end();
});
console.log(JSON.stringify({ control, probe: await nodeProbeIo.httpStatus(${port}, '/') }));`,
    );
    const platform = getPlatform({ home: absPath(root) });
    const proxy = `http://127.0.0.1:${proxyPort}`;
    const proc = platform.exec.spawn({
      argv: [process.execPath, script],
      cwd: absPath(root),
      env: {
        PATH: process.env.PATH ?? "",
        NODE_USE_ENV_PROXY: "1",
        http_proxy: proxy,
        HTTP_PROXY: proxy,
      },
      stdin: false,
    });
    const out: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    await proc.exited;
    await new Promise((resolve) => setTimeout(resolve, 50));
    const result = JSON.parse(Buffer.concat(out).toString("utf8")) as {
      control: number | null;
      probe: number | null;
    };
    expect(result.probe).toBe(200);
    // 对照：同一个进程里走全局 Agent 的普通请求确实被代理截走了，说明这个测试环境里代理开关是生效的
    expect(result.control).toBe(503);
    expect(proxyHits).toBe(1);
  });

  it("端口一直连不上就一直等，信号中止后停止探测", async () => {
    // 先占一个端口再关掉，得到一个确定没人监听的端口
    const closed = await new Promise<number>((resolve) => {
      const tcp = createTcpServer();
      tcp.listen(0, "127.0.0.1", () => {
        const { port } = tcp.address() as { port: number };
        tcp.close(() => resolve(port));
      });
    });
    const abort = new AbortController();
    let ready = false;
    void probe
      .waitReady({ ...context(closed, http), signal: abort.signal })
      .then(() => (ready = true));
    await new Promise((resolve) => setTimeout(resolve, 150));
    abort.abort();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ready).toBe(false);
  });
});

describe("真实进程：环境与就绪", () => {
  const platform = getPlatform({ home: absPath(root) });

  it("[RUN-LIFECYCLE-25] 管理进程的环境带着 ELECTRON_RUN_AS_NODE 时，真实子进程里看不到它；服务在 HTTP 应答后才 ready", async () => {
    const script = join(root, "server.js");
    writeFileSync(
      script,
      `const http = require('node:http');
console.log('electron:' + process.env.ELECTRON_RUN_AS_NODE + ' utf8:' + process.env.PYTHONUTF8);
setTimeout(() => {
  http.createServer((q, r) => r.end('ok')).listen(Number(process.env.PORT), '127.0.0.1');
}, 300);`,
    );
    const port = await new Promise<number>((resolve) => {
      const tcp = createTcpServer();
      tcp.listen(0, "127.0.0.1", () => {
        const { port: found } = tcp.address() as { port: number };
        tcp.close(() => resolve(found));
      });
    });
    const lines: string[] = [];
    const plan: RunPlan = {
      argv: [process.execPath, script],
      cwd: absPath(root),
      env: buildRunEnv({
        base: { PATH: process.env.PATH ?? "", ELECTRON_RUN_AS_NODE: "1" },
        runDefaults: platform.env.runDefaults(),
        port,
      }),
      stdin: false,
      stop: { mode: "graceful", graceMs: 2000 },
      port,
      url: `http://127.0.0.1:${port}`,
      ready: http,
    };
    const engine = new RunEngine({
      platform,
      clock: realClock,
      readiness: createReadinessProbe({ clock: realClock, pollMs: 20 }),
      preparer: { prepare: async () => ({ ok: true, plan }) },
      removeDir: async () => undefined,
      sinks: {
        state: () => undefined,
        log: (_id, entry: LogEntry) => {
          if (entry.kind === "stdout") lines.push(entry.text);
        },
      },
    });
    const { run } = engine.start({
      playgroundId: "pg",
      name: "demo",
      kind: "server",
      owner: { kind: "cli", command: "run" },
    });
    try {
      const startedAt = Date.now();
      await run.waitFor(["ready"]);
      expect(run.state).toBe("ready");
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(250);
      const pid = run.snapshot().pid;
      const identity = pid === undefined ? null : await platform.proc.identity(pid);
      if (pid !== undefined && identity)
        registerSpawned(platform, { pid, startTime: identity.startTime });
      expect(lines[0]).toBe("electron:undefined utf8:1");
    } finally {
      await run.stop();
    }
    expect(await platform.ports.isFree(port)).toBe("free");
  });

  it("Python 在非 UTF-8 的区域设置下输出中文不崩：环境变量生效", async () => {
    const env = buildRunEnv({
      base: { PATH: process.env.PATH ?? "", LC_ALL: "C", LANG: "C" },
      runDefaults: {},
    });
    const python = await platform.exec.which("python3", env, absPath(root));
    expect(python).not.toBeNull();
    const proc = platform.exec.spawn({
      argv: [python as string, "-c", "print('中文输出')"],
      cwd: absPath(root),
      env,
      stdin: false,
    });
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    const exited = await proc.exited;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exited.exitCode).toBe(0);
    expect(Buffer.concat(chunks).toString("utf8")).toBe("中文输出\n");
  });
});
