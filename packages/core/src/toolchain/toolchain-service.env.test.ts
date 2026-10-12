import { absPath } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import {
  createToolchainHarness,
  nodeOnly,
  project,
  resolveWith,
} from "./toolchain-harness.test.ts";

// 登录环境相关的核心一侧（平台一侧在 packages/platform）：重新检测、缓存期间不等待、
// 降级结果的提示、版本命令的工作目录、扫描结果与解析结果不一致时的取舍。

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("重新检测", () => {
  it("[TOOLCHAIN-DETECTION-12] 重新检测：缓存清空，重新解析环境并重新查找，用新的结果", async () => {
    const h = createToolchainHarness();
    h.fake.tools.missing("node");
    const first = await resolveWith(h, h.service.check({ requires: nodeOnly() }));
    expect(first.errors[0]?.code).toBe("TOOL_MISSING");
    expect(Object.keys(h.service.snapshot().entries)).toEqual(["global"]);

    // 用户刚装好工具
    h.fake.tools.install("node", { version: "24.21.0" });
    h.fake.env.loadCalls.length = 0;
    const second = await resolveWith(h, h.service.recheck());

    expect(h.fake.env.loadCalls[0]).toMatchObject({ refresh: true });
    expect(second.tools.find((t) => t.tool === "node")).toMatchObject({ status: "found" });
    // 缓存先被清空（写出过一次空结构），之后只有新的结果
    expect(h.cacheWrites.some((file) => Object.keys(file.entries).length === 0)).toBe(true);
    expect(h.service.snapshot().entries.global?.tools.find((t) => t.tool === "node")?.status).toBe(
      "found",
    );
  });

  it("[TOOLCHAIN-DETECTION-12] 刚指定了路径：重新检测后用指定的那份", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "20.19.0" });
    await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    const manual = absPath("/opt/n24/bin/node");
    h.toolPaths.node = manual;
    h.fake.processes.when([manual, "--version"], {
      output: [{ atMs: 0, stream: "stdout", data: "v24.0.0\n" }],
      exit: { afterMs: 0, code: 0 },
    });
    const after = await resolveWith(h, h.service.recheck());

    expect(after.tools.find((t) => t.tool === "node")).toMatchObject({
      path: manual,
      version: "24.0.0",
    });
  });

  it("应用启动时的 warmUp：后台刷新，完成后发 toolchain.changed，调用方不等待", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0" });
    const gate = h.fake.env.hold();

    h.service.warmUp();
    await flush();
    expect(h.changed).toEqual([]);

    gate.release();
    for (let i = 0; i < 20 && h.changed.length === 0; i++) {
      await h.fake.clock.advance(50);
      await flush();
    }
    expect(h.changed).toHaveLength(1);
  });
});

describe("缓存期间界面不等待", () => {
  it("[TOOLCHAIN-DETECTION-18] 环境缓存过期：立即用旧值，后台刷新完成后发 toolchain.changed", async () => {
    const h = createToolchainHarness();
    // 旧环境里 node 是 20；后台刷新完成后环境里变成了 24
    h.fake.tools.install("node", { version: "20.19.0" });
    const refreshed = deferred<{
      env: Record<string, string>;
      source: "login-shell";
      ms: number;
    }>();
    h.fake.env.set({
      env: { PATH: "/old" },
      refreshing: refreshed.promise,
    });

    const stale = await resolveWith(h, h.service.check({ requires: nodeOnly() }));
    expect(stale.tools[0]?.version).toBe("20.19.0");
    expect(h.changed).toEqual([]);

    // 刷新完成：环境变了，用新环境重新检测并通知
    h.fake.tools.missing("node");
    h.fake.tools.install("node", {
      version: "24.21.0",
      visibleWhen: (env) => env.PATH === "/new",
    });
    h.fake.env.set({ refreshing: undefined });
    refreshed.resolve({ env: { PATH: "/new" }, source: "login-shell", ms: 900 });
    for (let i = 0; i < 20 && h.changed.length === 0; i++) {
      await h.fake.clock.advance(50);
      await flush();
    }

    expect(h.changed).toHaveLength(1);
    const fresh = await h.service.check({ requires: nodeOnly(), cachedOnly: true });
    expect(fresh.tools[0]?.version).toBe("24.21.0");
  });

  it("[TOOLCHAIN-DETECTION-18] 同一次后台刷新被多次检测碰到，只通知一次", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0" });
    const refreshed = deferred<{
      env: Record<string, string>;
      source: "login-shell";
      ms: number;
    }>();
    h.fake.env.set({ refreshing: refreshed.promise });

    await resolveWith(h, h.service.check({ requires: nodeOnly() }));
    await resolveWith(h, h.service.check({ requires: nodeOnly() }));
    h.fake.env.set({ refreshing: undefined });
    refreshed.resolve({ env: { PATH: "/usr/bin" }, source: "login-shell", ms: 5 });
    for (let i = 0; i < 20; i++) {
      await h.fake.clock.advance(50);
      await flush();
    }

    expect(h.changed).toHaveLength(1);
  });

  it("[TOOLCHAIN-DETECTION-19] 环境已缓存，往已有目录装了新工具：实时找到，无需重新解析", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0" });
    await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    h.fake.tools.install("go", { version: "1.26.0" });
    const result = await resolveWith(
      h,
      h.service.check({ requires: { go: { version: ">=1.24" } } }),
    );

    expect(result.tools[0]).toMatchObject({ status: "found", version: "1.26.0" });
    expect(h.fake.env.loadCalls.some((call) => call.refresh === true)).toBe(false);
  });
});

describe("版本命令的工作目录", () => {
  it("[TOOLCHAIN-DETECTION-14] 以项目文件夹为工作目录读环境并执行版本命令，得到项目指定的版本", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", {
      version: (cwd) => (cwd === project ? "22.5.0" : "24.21.0"),
    });

    const inProject = await resolveWith(h, h.service.check({ requires: nodeOnly(), cwd: project }));
    const global = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(inProject.tools[0]?.version).toBe("22.5.0");
    expect(global.tools[0]?.version).toBe("24.21.0");
    expect(h.fake.env.loadCalls[0]).toMatchObject({ cwd: project });
    expect(h.fake.processes.spawned[0]?.cwd).toBe(project);
  });

  it("[TOOLCHAIN-DETECTION-13] 只有登录 shell 的环境里才有的 Node：找到并标记来源 login-shell", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", {
      version: "24.21.0",
      visibleWhen: (env) => (env.PATH ?? "").includes("/.nvm/"),
    });
    h.fake.env.set({
      env: { PATH: "/Users/x/.nvm/versions/node/bin:/usr/bin" },
      source: "login-shell",
    });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.tools[0]).toMatchObject({ status: "found", source: "login-shell" });
    expect(result.envSource).toBe("login-shell");
  });
});

describe("降级与回退的提示", () => {
  it("[TOOLCHAIN-DETECTION-15] 解析超时：先用扫描的结果，带 ENV_UNRESOLVED(timeout)，调用方不被后台重试挡住", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0", origin: "known-location" });
    const retry = deferred<{ env: Record<string, string>; source: "login-shell"; ms: number }>();
    h.fake.env.fallback({ PATH: "/usr/bin" });
    h.fake.env.set({ reason: "timeout", refreshing: retry.promise });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.envSource).toBe("fallback");
    expect(result.notices).toContainEqual({
      code: "ENV_UNRESOLVED",
      params: { reason: "timeout" },
    });
    expect(result.tools[0]).toMatchObject({ status: "found", source: "fallback" });
    // 后台还在重试，别的请求不受影响
    expect(
      (await h.service.check({ requires: nodeOnly(), cachedOnly: true })).tools[0]?.status,
    ).toBe("found");
    expect(h.changed).toEqual([]);

    h.fake.env.set({ refreshing: undefined, source: "login-shell", reason: undefined });
    retry.resolve({ env: { PATH: "/usr/bin" }, source: "login-shell", ms: 800 });
    for (let i = 0; i < 20 && h.changed.length === 0; i++) {
      await h.fake.clock.advance(50);
      await flush();
    }
    expect(h.changed).toHaveLength(1);
  });

  it("[TOOLCHAIN-DETECTION-15] 解析失败：ENV_UNRESOLVED(failed)", async () => {
    const h = createToolchainHarness();
    h.fake.env.fallback();
    h.fake.env.set({ reason: "failed" });
    h.fake.tools.missing("node");

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.notices).toContainEqual({ code: "ENV_UNRESOLVED", params: { reason: "failed" } });
  });

  it("[TOOLCHAIN-DETECTION-16] 只读到非交互环境：来源 login-shell-degraded，发 ENV_DEGRADED", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0" });
    h.fake.env.degraded();

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.envSource).toBe("login-shell-degraded");
    expect(result.tools[0]?.source).toBe("login-shell-degraded");
    expect(result.notices).toContainEqual({ code: "ENV_DEGRADED", params: {} });
  });

  it("[TOOLCHAIN-DETECTION-17] 不能解析的 shell：来源 fallback，用常见目录扫描的结果", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0", origin: "known-location" });
    h.fake.env.fallback();
    h.fake.env.set({ reason: "failed" });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.tools[0]).toMatchObject({ status: "found", source: "fallback" });
  });

  it("path-only 来源不发提示（没有对应的提示码，规格也没要求）", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0" });
    h.fake.env.set({ source: "path-only" });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.notices).toEqual([]);
    expect(result.tools[0]?.source).toBe("path-only");
  });

  it("[TOOLCHAIN-DETECTION-20] 解析成功时以解析结果为准：只在常见目录里的那份不算数", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0", origin: "known-location" });
    h.fake.env.set({ source: "login-shell" });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.tools[0]?.status).toBe("missing");
    expect(h.spawnedArgv()).toEqual([]);
  });
});
