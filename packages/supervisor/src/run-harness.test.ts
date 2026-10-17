import { join } from "node:path";
import type { PrepareOutcome, ReadinessProbe, RunPlan, RunPreparer } from "@runyard/core";
import { absPath } from "@runyard/platform";
import type { Owner, RunSnapshot } from "@runyard/protocol";
import type { ProcessBehavior } from "@runyard/testing";
import { expect, it } from "vitest";
import { composeExtensions } from "./compose-extensions.ts";
import { LibraryWorld, Pump } from "./library-harness.test.ts";
import type { LogModule } from "./log-module.ts";
import type { RunModule, RunModuleOptions } from "./run-module.ts";
import type { Session } from "./session.ts";
import type { SupervisorHandle } from "./supervisor-options.ts";

// 运行编排单元测试共用的现场：LibraryWorld 加上真实的 RunModule（准备阶段和就绪探测换成替身）。
// 服务的进程是 ["node", "server.js", <端口>]，脚本是 ["node", "script.js"]；剧本按这个 argv 登记。

export const tabOwner = (clientId = "app-1", tabId = "t1"): Owner => ({
  kind: "tab",
  clientId,
  tabId,
});
export const cliOwner: Owner = { kind: "cli", command: "runyard run" };

const stop = { mode: "graceful", graceMs: 2000 } as const;

export class RunWorld extends LibraryWorld {
  module!: RunModule;
  /** 打开后装上日志模块（#43），与入口 run-main.ts 的装配一致 */
  withLogs = false;
  logModule!: LogModule;
  readonly mentions: string[] = [];
  readonly ports = new Map<string, number>();
  #nextPort = 7100;
  moduleOptions: Partial<RunModuleOptions> = {};
  /** 服务运行器的 watch 规则；默认不监听（#262 的测试改成 restart，和 hono 运行器一样） */
  serverWatch: Record<string, unknown> = { mode: "none" };

  portOf(id: string): number {
    let port = this.ports.get(id);
    if (port === undefined) {
      port = this.#nextPort++;
      this.ports.set(id, port);
    }
    return port;
  }

  readonly preparer: RunPreparer = {
    prepare: async (context): Promise<PrepareOutcome> => {
      const dir = absPath(join("/work", context.request.name));
      if (context.request.kind === "oneshot") {
        const plan: RunPlan = {
          argv: ["node", "script.js"],
          cwd: dir,
          env: {},
          stdin: true,
          stop,
        };
        return { ok: true, plan };
      }
      const port = context.request.port ?? this.portOf(context.request.playgroundId);
      const plan: RunPlan = {
        argv: ["node", "server.js", String(port)],
        cwd: dir,
        env: {},
        stdin: false,
        stop,
        port,
        url: `http://127.0.0.1:${port}`,
      };
      return { ok: true, plan };
    },
  };

  // 端口被占用就是就绪（同 core 测试的做法）
  readonly readiness: ReadinessProbe = {
    waitReady: ({ plan, signal }) =>
      new Promise((resolve) => {
        const { platform } = this.world.fake;
        let timer: number | undefined;
        const poll = () => {
          if (signal.aborted || plan.port === undefined) return;
          void platform.ports.isFree(plan.port).then((status) => {
            if (status === "in-use") resolve();
            else if (!signal.aborted) timer = this.clock.setTimeout(poll, 100);
          });
        };
        timer = this.clock.setTimeout(poll, 100);
        signal.addEventListener("abort", () => {
          if (timer !== undefined) this.clock.clearTimeout(timer);
        });
      }),
  };

  override async start(seams = {}): Promise<void> {
    const runner = (id: string, kind: "server" | "oneshot") =>
      JSON.stringify({
        formatVersion: 1,
        id,
        kind,
        needs: [],
        run: { command: ["node", "x"] },
        preview: { type: "web" },
        // 脚本保存后重跑（#138）：和真实的脚本运行器一样只看 .js；服务默认不监听
        watch:
          kind === "oneshot"
            ? { mode: "rerun", paths: ["**/*.js"], debounceMs: 300 }
            : this.serverWatch,
        stop: { mode: "graceful", graceMs: 2000 },
      });
    const runners = absPath(join("/app/templates", "runners"));
    for (const [id, kind] of [
      ["node-server", "server"],
      ["node-script", "oneshot"],
    ] as const) {
      const dir = absPath(join(runners, id));
      await this.world.fake.platform.fs.makeDir(dir);
      await this.world.fake.platform.fs.writeFile(
        absPath(join(dir, "runner.json")),
        runner(id, kind),
      );
    }
    this.handle = await this.world.start({
      log: (line) => this.logs.push(line),
      extend: (api) => {
        const composed = composeExtensions(api, {
          templateData: {
            runnersDir: runners,
            toolsDir: absPath(join("/app/templates", "tools")),
          },
          appVersion: "0.0.0-test",
          log: (line) => this.logs.push(line),
          run: {
            preparer: this.preparer,
            readiness: this.readiness,
            observer: {
              mentioned: (run: { runId: string }, session: Session | undefined) =>
                void this.mentions.push(`${run.runId}:${session?.info?.kind ?? "-"}`),
            },
            ...this.moduleOptions,
          },
        });
        this.module = composed.run;
        this.logModule = composed.logs;
        return {
          ...composed.extensions,
          library: { ...this.seams(), ...seams, runs: composed.run.runs },
        };
      },
    });
  }

  /** 以应用的身份连上（订阅 run 主题）；pid 区分不同的“应用进程” */
  async app(pid = process.pid): Promise<Pump> {
    const client = await this.world.session(this.handle as SupervisorHandle, { kind: "app", pid });
    const pump = new Pump(client);
    this.pumps.push(pump);
    await pump.result("events.subscribe", { topics: ["run", "playground"] });
    return pump;
  }

  async newProject(pump: Pump, name: string, script = false): Promise<string> {
    const created = await this.create(pump, name, script ? { template: "script" } : {});
    return created.playground.id;
  }

  /** 推进假时间直到条件成立；每一步之间让出真实的 I/O */
  async until(check: () => Promise<boolean>, stepMs = 100, limitSteps = 300): Promise<void> {
    for (let i = 0; i < limitSteps; i++) {
      if (await check()) return;
      await this.clock.advance(stepMs);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    throw new Error("condition never became true");
  }

  /** 一边推进假时间一边等一个 Promise（停止、关闭这类要靠假时间走完的事） */
  async drive<T>(promise: Promise<T>, stepMs = 100, limitSteps = 300): Promise<T> {
    let done = false;
    let value: T | undefined;
    let failure: unknown;
    promise.then(
      (v) => {
        value = v;
        done = true;
      },
      (e: unknown) => {
        failure = e;
        done = true;
      },
    );
    for (let i = 0; i < limitSteps && !done; i++) {
      await this.clock.advance(stepMs);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    if (!done) throw new Error("promise never settled");
    if (failure !== undefined) throw failure;
    return value as T;
  }

  override async dispose(): Promise<void> {
    for (const pump of this.pumps) pump.stop();
    await this.drive(this.world.dispose());
  }

  /** 等连接数降到 n（强杀连接后，管理进程看到断开要几个真实的事件循环） */
  async connectionsDown(n: number): Promise<void> {
    for (let i = 0; i < 400 && this.handle.connectionCount() > n; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(this.handle.connectionCount()).toBeLessThanOrEqual(n);
  }

  server(name: string | undefined, behavior: ProcessBehavior = {}): void {
    // 端口由 portOf 按项目 id 分配，剧本按 argv 匹配
    this.world.fake.processes.when(
      (spec) =>
        spec.argv[1] === "server.js" &&
        (name === undefined || spec.cwd === absPath(join("/work", name))),
      (spec) => ({ listenOn: { port: Number(spec.argv[2]), atMs: 100 }, ...behavior }),
    );
  }

  async startRun(
    pump: Pump,
    ref: string,
    owner: Owner,
    extra: Record<string, unknown> = {},
  ): Promise<RunSnapshot> {
    return pump.result<RunSnapshot>("run.start", {
      playground: ref,
      owner,
      wait: "none",
      ...extra,
    });
  }

  async stateOf(pump: Pump, runId: string): Promise<string> {
    return (await pump.result<RunSnapshot>("run.get", { runId })).state;
  }

  async ready(pump: Pump, runId: string): Promise<void> {
    await this.until(async () => (await this.stateOf(pump, runId)) === "ready");
  }
}

it("harness: 现场能起一个带运行编排的管理进程并启动一个服务", async () => {
  const w = new RunWorld();
  await w.start();
  const app = await w.app();
  const id = await w.newProject(app, "demo");
  w.server("demo");
  const run = await w.startRun(app, id, tabOwner());
  expect(run.alreadyRunning).toBe(false);
  await w.ready(app, run.runId);
  expect(expect.getState().currentTestName).toBeDefined();
  await w.dispose();
});
