import { type AbsPath, absPath, joinPath, posixRelPath } from "@runyard/platform";
import type { LogEntry, Owner, Requires, Runner, RunSnapshot } from "@runyard/protocol";
import { createFakePlatform } from "@runyard/testing";
import { createReadinessProbe } from "../run/readiness-probe.ts";
import { RunEngine } from "../run/run-engine.ts";
import type { RunExitEvent, RunPortEvent, RunStateEvent, StartRequest } from "../run/run-types.ts";
import { definitions } from "../toolchain/toolchain-harness.test.ts";
import { ToolchainService } from "../toolchain/toolchain-service.ts";
import type { RunSubject } from "./prepare-types.ts";
import { createRunPreparer, type RunPreparerDeps } from "./run-preparer.ts";

// 准备阶段、脚本重跑测试共用的现场：假平台上装好 node、pnpm、npm、python，
// 一个服务运行器（vite 风格，装依赖再启动）和一个脚本运行器（python-file，带语法检查和 watch），
// 真正的准备器、就绪探测和引擎接在一起。放在 *.test.ts 里是因为只有测试文件能导入 @runyard/testing。

// 经路径工具拼出来：各系统的分隔符一致，内存文件系统的监视才认得出里面的文件
export const folder = joinPath(absPath("/fake/project"), posixRelPath("demo"));
/** 项目文件夹里的文件；路径经平台的路径工具拼，和被测代码一致 */
export const at = (relative: string) => joinPath(folder, posixRelPath(relative));
export const owner: Owner = { kind: "cli", command: "run" };

export const serverRunner: Runner = {
  formatVersion: 1,
  id: "vite",
  kind: "server",
  needs: ["node", { anyOf: ["pnpm", "npm"] }],
  setup: {
    inputs: ["package.json", "pnpm-lock.yaml", "package-lock.json"],
    stamp: "node_modules/.runyard-setup.json",
    variants: {
      pnpm: { command: ["pnpm", "install", "--prefer-offline"] },
      npm: { command: ["npm", "install", "--prefer-offline"] },
    },
    errors: [
      {
        match: "ERR_PNPM_NO_OFFLINE_TARBALL|ENOTCACHED|ENOTFOUND|EAI_AGAIN",
        reason: "DEPS_OFFLINE",
      },
      { match: "VCRUNTIME140", reason: "RUNTIME_MISSING" },
    ],
  },
  run: { command: ["node", "server.js", "--port", "{port}"] },
  ready: { http: { path: "/" }, slowAfterMs: 30000 },
  preview: { type: "web", path: "/" },
  watch: { mode: "none" },
  stop: { mode: "graceful", graceMs: 2000 },
};

export const scriptRunner: Runner = {
  formatVersion: 1,
  id: "python-file",
  kind: "oneshot",
  needs: ["python"],
  check: { command: ["python", "-c", "check", "{entry}"], timeoutMs: 5000 },
  run: {
    command: ["python", "-u", "{entry}"],
    env: { PYTHONDONTWRITEBYTECODE: "1" },
    stdin: true,
  },
  preview: { type: "console" },
  watch: {
    mode: "rerun",
    paths: ["**/*.py"],
    ignore: ["__pycache__/**"],
    debounceMs: 300,
  },
  stop: { mode: "graceful", graceMs: 2000 },
};

export const serverRequires: Requires = {
  node: { version: ">=22" },
  pnpm: { version: ">=10", fallback: "npm" },
  npm: { version: ">=10" },
};
export const scriptRequires: Requires = { python: { version: ">=3.12" } };

export type HarnessOptions = {
  runner?: Runner;
  requires?: Requires;
  registeredPort?: number;
  otherPorts?: number[];
  packageManager?: string;
  tools?: ("node" | "pnpm" | "npm" | "python" | "go")[];
  loginEnv?: Record<string, string>;
  serve?: RunPreparerDeps["serveStatic"];
  autoRun?: () => boolean;
};

export function createPrepareHarness(options: HarnessOptions = {}) {
  const fake = createFakePlatform();
  const { platform, clock } = fake;
  const runner = options.runner ?? serverRunner;
  const requires =
    options.requires ?? (runner.kind === "oneshot" ? scriptRequires : serverRequires);
  const versions = {
    node: "22.20.0",
    pnpm: "10.30.0",
    npm: "10.9.0",
    python: "3.13.1",
    go: "1.26.0",
  };
  for (const tool of options.tools ?? (["node", "pnpm", "npm", "python", "go"] as const)) {
    if (tool === "python") {
      // 工具定义里 python 的可执行文件名是 python3 在前（macOS 上只有 python3）
      fake.tools.install("python3", {
        version: versions.python,
        versionOutput: `Python ${versions.python}\n`,
      });
    } else fake.tools.install(tool, { version: versions[tool] });
  }
  if (options.loginEnv !== undefined) fake.env.set({ env: options.loginEnv });
  fake.fs.mkdir(folder);
  fake.fs.writeFile(at("package.json"), '{"name":"demo"}');
  fake.fs.writeFile(at("server.js"), "// server");
  fake.fs.writeFile(at("main.py"), "print('hi')");

  const subject: RunSubject = {
    folder,
    runner,
    requires,
    entry: "main.py",
    otherRegisteredPorts: new Set(options.otherPorts ?? []),
    ...(options.registeredPort === undefined ? {} : { registeredPort: options.registeredPort }),
    ...(options.packageManager === undefined ? {} : { packageManager: options.packageManager }),
  };
  const toolchain = new ToolchainService({
    platform,
    clock,
    definitions,
    toolPaths: () => ({}),
    onChanged: () => undefined,
  });
  const preparer = createRunPreparer({
    platform,
    clock,
    toolchain,
    definitions,
    resolve: async () => subject,
    ...(options.serve === undefined ? {} : { serveStatic: options.serve }),
  });
  // 就绪探测的假网络：端口被某个进程占着就是“连得上、有 HTTP 响应”
  const readiness = createReadinessProbe({
    clock,
    io: {
      httpStatus: async (port) => ((await platform.ports.isFree(port)) === "in-use" ? 200 : null),
      tcpOpen: async (port) => (await platform.ports.isFree(port)) === "in-use",
    },
  });
  const states: RunStateEvent[] = [];
  const logs: { runId: string; entry: LogEntry }[] = [];
  const exits: RunExitEvent[] = [];
  const portEvents: RunPortEvent[] = [];
  const removed: AbsPath[] = [];
  const engine = new RunEngine({
    platform,
    clock,
    readiness,
    preparer,
    sinks: {
      state: (event) => states.push(event),
      log: (runId, entry) => logs.push({ runId, entry }),
      exit: (event) => exits.push(event),
      port: (event) => portEvents.push(event),
    },
    removeDir: async (dir) => {
      removed.push(dir);
      fake.fs.remove(dir);
    },
  });

  const request = (overrides: Partial<StartRequest> = {}): StartRequest => ({
    playgroundId: "pg-1",
    name: "demo",
    kind: runner.kind,
    owner,
    ...overrides,
  });
  const settle = () => clock.advance(0);
  // 分小步推进：准备阶段里有几处要让出事件循环，一大步之后链条可能还没走完
  const advance = async (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 10)
      await clock.advance(Math.min(10, ms - elapsed));
    await clock.advance(0);
  };
  const notices = () =>
    logs.flatMap(({ entry }) => (entry.kind === "system" ? [entry.notice] : []));
  const stateNames = () => states.map((s) => s.run.state);
  const lastSnapshot = (): RunSnapshot | undefined => states.at(-1)?.run;
  return {
    fake,
    subject,
    engine,
    preparer,
    toolchain,
    request,
    settle,
    advance,
    notices,
    stateNames,
    lastSnapshot,
    states,
    logs,
    exits,
    portEvents,
    removed,
  };
}

export type PrepareHarness = ReturnType<typeof createPrepareHarness>;

// 测试里常用的命令行和小帮手
export const installArgv = ["/fake/bin/pnpm", "install", "--prefer-offline"];
export const serverArgv = (port: number) => ["/fake/bin/node", "server.js", "--port", String(port)];
export const installOk = { exit: { afterMs: 10, code: 0 } } as const;
export const spawnedArgvs = (h: PrepareHarness) =>
  h.fake.processes.spawned.map((s) => s.argv.join(" "));

// 服务在端口上起来（假进程就绪 = 占住端口）
export function serveOn(h: PrepareHarness, port: number) {
  h.fake.processes.when(serverArgv(port), { listenOn: { port, atMs: 100 } });
}
export async function stopRun(h: PrepareHarness, run: { stop(): Promise<unknown> }) {
  const stopped = run.stop();
  await h.advance(4000);
  await stopped;
}
