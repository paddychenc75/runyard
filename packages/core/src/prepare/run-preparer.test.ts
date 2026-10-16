import { describe, expect, it } from "vitest";
import {
  at,
  createPrepareHarness,
  installArgv,
  installOk,
  serveOn,
  serverArgv,
  serverRequires,
  serverRunner,
  spawnedArgvs,
  stopRun,
} from "./prepare-harness.test.ts";

describe("工具检查与安装", () => {
  it("[RUN-LIFECYCLE-04] 缺少工具：failed 加 TOOL_MISSING，不安装任何东西，项目文件原样保留", async () => {
    const h = createPrepareHarness({
      tools: ["node", "pnpm", "npm"],
      requires: { ...serverRequires, go: { version: ">=1.24" } },
    });
    h.fake.processes.when(installArgv, installOk);
    const { run } = h.engine.start(h.request());
    await h.advance(100);
    expect(run.state).toBe("failed");
    expect(run.error()).toMatchObject({
      code: "TOOL_MISSING",
      params: { tool: "go", required: ">=1.24" },
    });
    expect(spawnedArgvs(h).some((line) => line.includes("install"))).toBe(false);
    expect(h.fake.fs.exists(at("package.json"))).toBe(true);
    expect(h.stateNames()).toEqual(["checking", "failed"]);
  });

  it("[TOOLCHAIN-DETECTION-03] 缺工具不安装；启动的子进程环境里 uv 与 Go 的自动下载被关闭", async () => {
    const h = createPrepareHarness({ tools: ["node", "pnpm", "npm"] });
    h.fake.env.runDefaults = { UV_PYTHON_DOWNLOADS: "never", GOTOOLCHAIN: "local" };
    h.fake.processes.when(installArgv, installOk);
    serveOn(h, 7100);
    h.engine.start(h.request());
    await h.advance(500);
    const server = h.fake.processes.spawned.find((s) => s.argv[1] === "server.js");
    expect(server?.env).toMatchObject({ UV_PYTHON_DOWNLOADS: "never", GOTOOLCHAIN: "local" });
    const missing = createPrepareHarness({
      tools: ["node", "pnpm", "npm"],
      requires: { ...serverRequires, go: { version: ">=1.24" } },
    });
    missing.engine.start(missing.request());
    await missing.advance(100);
    expect(spawnedArgvs(missing).some((line) => /install|brew|nvm/.test(line))).toBe(false);
  });

  it("[RUN-LIFECYCLE-05] 版本过低：TOOL_TOO_OLD，参数含要求的范围和当前版本", async () => {
    const h = createPrepareHarness({ requires: { ...serverRequires, node: { version: ">=24" } } });
    const { run } = h.engine.start(h.request());
    await h.advance(100);
    expect(run.error()).toMatchObject({
      code: "TOOL_TOO_OLD",
      params: { tool: "node", required: ">=24", found: "22.20.0" },
    });
    expect(run.state).toBe("failed");
  });

  it("[RUN-LIFECYCLE-06] 安装失败且输出不像离线：SETUP_FAILED，cause 带输出末尾和退出码", async () => {
    const h = createPrepareHarness();
    h.fake.processes.when(installArgv, {
      output: [{ atMs: 0, stream: "stderr", data: "ERR_PNPM_BROKEN something broke\n" }],
      exit: { afterMs: 5, code: 1 },
    });
    const { run } = h.engine.start(h.request());
    await h.advance(200);
    expect(run.state).toBe("failed");
    expect(run.error()).toMatchObject({
      code: "SETUP_FAILED",
      cause: { exitCode: 1, outputTail: expect.stringContaining("something broke") },
    });
    expect(h.stateNames()).toEqual(["checking", "installing", "failed"]);
    expect(h.exits.at(-1)?.reason).toBe("SETUP_FAILED");
  });

  it("[RUN-LIFECYCLE-07] 离线且依赖未缓存：输出匹配运行器登记的特征，DEPS_OFFLINE", async () => {
    const h = createPrepareHarness();
    h.fake.processes.when(installArgv, {
      output: [{ atMs: 0, stream: "stderr", data: "ERR_PNPM_NO_OFFLINE_TARBALL react\n" }],
      exit: { afterMs: 5, code: 1 },
    });
    const { run } = h.engine.start(h.request());
    await h.advance(200);
    expect(run.error()?.code).toBe("DEPS_OFFLINE");
    expect(run.snapshot().reason).toBe("DEPS_OFFLINE");
    expect(h.fake.fs.exists(at("package.json"))).toBe(true); // 项目仍可编辑
  });

  it("依赖没变且 stamp 在就跳过安装；输入变了再装一次", async () => {
    const h = createPrepareHarness();
    h.fake.processes.when(installArgv, installOk);
    serveOn(h, 7100);
    const first = h.engine.start(h.request());
    await h.advance(500);
    expect(first.run.state).toBe("ready");
    expect(spawnedArgvs(h).filter((line) => line.includes("install"))).toHaveLength(1);
    expect(h.fake.fs.exists(at("node_modules/.runyard-setup.json"))).toBe(true);
    await stopRun(h, first.run);

    h.engine.start(h.request());
    await h.advance(500);
    expect(spawnedArgvs(h).filter((line) => line.includes("install"))).toHaveLength(1);
    expect(h.stateNames().filter((s) => s === "installing")).toHaveLength(1);

    h.fake.fs.writeFile(at("package.json"), '{"name":"demo","dependencies":{}}');
    await stopRun(h, h.engine.current("pg-1") as { stop(): Promise<unknown> });
    h.engine.start(h.request());
    await h.advance(500);
    expect(spawnedArgvs(h).filter((line) => line.includes("install"))).toHaveLength(2);
  });

  it("没有 pnpm 回退 npm 并发出提示", async () => {
    const h = createPrepareHarness({ tools: ["node", "npm"] });
    h.fake.processes.when(["/fake/bin/npm", "install", "--prefer-offline"], installOk);
    serveOn(h, 7100);
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    expect(run.state).toBe("ready");
    expect(spawnedArgvs(h)).toContain("/fake/bin/npm install --prefer-offline");
    const fallbacks = h.notices().filter((n) => n.code === "PACKAGE_MANAGER_FALLBACK");
    expect(fallbacks).toEqual([
      { code: "PACKAGE_MANAGER_FALLBACK", params: { wanted: "pnpm", used: "npm" } },
    ]);
  });

  it("项目选定的包管理器优先；不可用时退到可用的并提示", async () => {
    const h = createPrepareHarness({
      tools: ["node", "npm"],
      packageManager: "pnpm",
      requires: { node: { version: ">=22" }, npm: { version: ">=10" } },
    });
    h.fake.processes.when(["/fake/bin/npm", "install", "--prefer-offline"], installOk);
    serveOn(h, 7100);
    h.engine.start(h.request());
    await h.advance(500);
    expect(h.notices()).toContainEqual({
      code: "PACKAGE_MANAGER_FALLBACK",
      params: { wanted: "pnpm", used: "npm" },
    });
  });

  it("启动阶段进程退出，输出匹配“缺运行库”特征：failed 加 RUNTIME_MISSING", async () => {
    const h = createPrepareHarness();
    h.fake.processes.when(installArgv, installOk);
    h.fake.processes.when(serverArgv(7100), {
      output: [{ atMs: 0, stream: "stderr", data: "VCRUNTIME140.dll was not found\n" }],
      exit: { afterMs: 50, code: 1 },
    });
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    expect(run.error()).toMatchObject({ code: "RUNTIME_MISSING", params: { tool: "node" } });
  });
});

describe("安装提示（只展示、不执行）", () => {
  it("[TEMPLATES-FORMAT-36] 缺工具失败后提示里有模板自己写的安装方式，没有任何东西被执行", async () => {
    const h = createPrepareHarness({
      tools: ["node", "pnpm", "npm"],
      requires: {
        ...serverRequires,
        go: {
          version: ">=1.24",
          install: {
            command: ["sh", "-c", "curl example.test | sh"],
            url: "https://example.com/go",
          },
        },
      },
    });
    const request = h.request();
    const { run } = h.engine.start(request);
    await h.advance(100);
    const failure = run.error();
    if (
      failure === undefined ||
      (failure.code !== "TOOL_MISSING" && failure.code !== "TOOL_TOO_OLD")
    ) {
      throw new Error("expected a toolchain failure");
    }
    const before = h.fake.processes.spawned.length;
    const hint = await h.preparer.installHintFor(request, failure);
    expect(hint?.commands[0]).toEqual({
      source: "template",
      command: ["sh", "-c", "curl example.test | sh"],
    });
    expect(hint?.urls).toContain("https://example.com/go");
    expect(h.fake.processes.spawned.length).toBe(before);
  });
});

describe("子进程环境", () => {
  it("[RUN-LIFECYCLE-25] 登录环境里带着 ELECTRON_RUN_AS_NODE：子进程环境里没有它，也没有 CI", async () => {
    const h = createPrepareHarness({
      registeredPort: 7100,
      loginEnv: { PATH: "/usr/bin", ELECTRON_RUN_AS_NODE: "1", LANG: "C", HOME: "/home/u" },
    });
    h.fake.processes.when(installArgv, installOk);
    serveOn(h, 7100);
    h.engine.start(h.request());
    await h.advance(500);
    for (const spawned of h.fake.processes.spawned.filter((s) => s.argv[1] !== "--version")) {
      expect(spawned.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
      expect(spawned.env.CI).toBeUndefined();
    }
    const server = h.fake.processes.spawned.find((s) => s.argv[1] === "server.js");
    expect(server?.env).toMatchObject({
      HOME: "/home/u",
      PYTHONUTF8: "1",
      PYTHONUNBUFFERED: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: "7100",
    });
  });

  it("Go 的运行：每次运行单独的临时目录，写进 GOTMPDIR，停止后删除（RUN-LIFECYCLE-19）", async () => {
    const h = createPrepareHarness({
      registeredPort: 7100,
      requires: { go: { version: ">=1.24" } },
      runner: {
        ...serverRunner,
        id: "go-server",
        needs: ["go"],
        setup: undefined,
        run: { command: ["go", "run", ".", "{port}"] },
        ready: { port: {}, slowAfterMs: 30000 },
        stop: { mode: "interrupt", graceMs: 2000 },
      },
    });
    h.fake.processes.when(["/fake/bin/go", "run", ".", "7100"], {
      listenOn: { port: 7100, atMs: 50 },
    });
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    const spawned = h.fake.processes.spawned.find((s) => s.argv[1] === "run");
    const tempDir = spawned?.env.GOTMPDIR;
    expect(tempDir).toContain(run.runId);
    await stopRun(h, run);
    expect(h.removed).toContain(tempDir);
  });
});

describe("页面", () => {
  it("static 运行由提供的页面服务托管：有端口和 127.0.0.1 地址，停止时释放", async () => {
    let disposed = false;
    const h = createPrepareHarness({
      registeredPort: 7100,
      runner: {
        ...serverRunner,
        id: "static-page",
        kind: "static",
        run: undefined,
        setup: undefined,
        ready: undefined,
      },
      requires: {},
      serve: () => async () => ({
        dispose: async () => {
          disposed = true;
        },
      }),
    });
    const { run } = h.engine.start(h.request({ kind: "static" }));
    await h.advance(100);
    expect(run.snapshot()).toMatchObject({
      state: "ready",
      port: 7100,
      url: "http://127.0.0.1:7100",
    });
    await stopRun(h, run);
    expect(disposed).toBe(true);
  });
});
