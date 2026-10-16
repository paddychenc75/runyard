import { absPath } from "@runyard/platform";
import type { LogEntry } from "@runyard/protocol";
import { FakeClock } from "@runyard/testing";
import { describe, expect, it } from "vitest";
import type { ProbeIo } from "./probe-io.ts";
import { createReadinessProbe } from "./readiness-probe.ts";
import type { ReadinessContext, RunPlan } from "./run-types.ts";

const plan = (overrides: Partial<RunPlan> = {}): RunPlan => ({
  argv: ["node", "server.js"],
  cwd: absPath("/fake/project"),
  env: {},
  stdin: false,
  stop: { mode: "graceful", graceMs: 2000 },
  port: 7100,
  ...overrides,
});

function setup(io: Partial<ProbeIo>) {
  const clock = new FakeClock();
  const calls: string[] = [];
  const full: ProbeIo = {
    httpStatus: async (port, path) => {
      calls.push(`http ${port}${path}`);
      return io.httpStatus ? io.httpStatus(port, path) : null;
    },
    tcpOpen: async (port) => {
      calls.push(`tcp ${port}`);
      return io.tcpOpen ? io.tcpOpen(port) : false;
    },
  };
  const probe = createReadinessProbe({ clock, io: full });
  const abort = new AbortController();
  const listeners = new Set<(entry: LogEntry) => void>();
  const context = (p: RunPlan): ReadinessContext => ({
    runId: "r1",
    plan: p,
    signal: abort.signal,
    onLine: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  });
  let ready = false;
  const start = (p: RunPlan) => void probe.waitReady(context(p)).then(() => (ready = true));
  const line = (text: string, kind: LogEntry["kind"] = "stdout") => {
    for (const listener of listeners) listener({ at: 0, kind, text } as LogEntry);
  };
  return { clock, calls, abort, start, isReady: () => ready, line, listeners };
}

describe("就绪探测", () => {
  it("[RUN-PORTS-14] 端口先开、页面两秒后才应答 HTTP：收到第一个响应之后才就绪", async () => {
    const t = setup({
      httpStatus: async () => (t.clock.now() - startedAt >= 2000 ? 200 : null),
    });
    const startedAt = t.clock.now();
    t.start(plan({ ready: { http: { path: "/" }, slowAfterMs: 30000 } }));
    await t.clock.advance(1900);
    expect(t.isReady()).toBe(false);
    await t.clock.advance(200);
    expect(t.isReady()).toBe(true);
  });

  it("http：低于 500 的响应（含 404、302）都算就绪，503 不算", async () => {
    let status = 503;
    const t = setup({ httpStatus: async () => status });
    t.start(plan({ ready: { http: { path: "/health" }, slowAfterMs: 30000 } }));
    await t.clock.advance(500);
    expect(t.isReady()).toBe(false);
    status = 404;
    await t.clock.advance(100);
    expect(t.isReady()).toBe(true);
    expect(t.calls[0]).toBe("http 7100/health");
  });

  it("port：端口能连上就绪", async () => {
    let open = false;
    const t = setup({ tcpOpen: async () => open });
    t.start(plan({ ready: { port: {}, slowAfterMs: 30000 } }));
    await t.clock.advance(300);
    expect(t.isReady()).toBe(false);
    open = true;
    await t.clock.advance(100);
    expect(t.isReady()).toBe(true);
  });

  it("log：输出里出现匹配的行（先去掉颜色码）才就绪；命令和系统条目不算", async () => {
    const t = setup({});
    t.start(plan({ ready: { log: { match: "Listening on" }, slowAfterMs: 30000 } }));
    await t.clock.advance(0);
    t.line("starting...");
    t.line("Listening on", "system");
    expect(t.isReady()).toBe(false);
    t.line("\u001b[32mListening on\u001b[0m http://127.0.0.1:7100");
    await t.clock.advance(0);
    expect(t.isReady()).toBe(true);
    expect(t.listeners.size).toBe(0);
  });

  it("没有 ready 判断（页面）立刻就绪", async () => {
    const t = setup({});
    t.start(plan());
    await t.clock.advance(0);
    expect(t.isReady()).toBe(true);
  });

  it("信号中止后不再探测，也不会就绪", async () => {
    const t = setup({});
    t.start(plan({ ready: { http: { path: "/" }, slowAfterMs: 30000 } }));
    await t.clock.advance(250);
    const before = t.calls.length;
    t.abort.abort();
    await t.clock.advance(1000);
    expect(t.calls.length).toBe(before);
    expect(t.isReady()).toBe(false);
  });
});
