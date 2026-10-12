import { absPath } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import {
  createToolchainHarness,
  fakePath,
  nodeOnly,
  project,
  resolveWith,
} from "./toolchain-harness.test.ts";

// 规格 toolchain/detection：按工具定义检测、版本范围、回退、手动指定的路径。
// 假进程的输出由假时钟推进，harness.check 在等待期间让时钟走动。

describe("只在用到时检查，且不代为安装", () => {
  it("[TOOLCHAIN-DETECTION-01] 用不到 Go 的项目：没有检测 Go，也没有关于 Go 的提示", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0" });
    h.fake.tools.missing("go");

    const html = await resolveWith(h, h.service.check({ requires: {} }));
    expect(html).toMatchObject({ tools: [], errors: [], notices: [] });
    expect(h.spawnedArgv()).toEqual([]);

    const react = await resolveWith(h, h.service.check({ requires: nodeOnly() }));
    expect(react.errors).toEqual([]);
    expect(react.tools.map((t) => t.tool)).toEqual(["node"]);
    expect(JSON.stringify(react.notices)).not.toContain("go");
    expect(h.spawnedArgv().every((argv) => argv[0] === fakePath("node"))).toBe(true);
  });

  it("[TOOLCHAIN-DETECTION-02] cachedOnly：不执行任何版本命令，缓存里没有的工具结果为空", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("python", { version: "3.12.4" });

    const result = await h.service.check({
      requires: { python: { version: ">=3.12 <3.15" } },
      cachedOnly: true,
    });

    expect(result.tools).toEqual([{ tool: "python", status: "unknown", required: ">=3.12 <3.15" }]);
    expect(result.errors).toEqual([]);
    expect(h.spawnedArgv()).toEqual([]);
    expect(h.fake.env.loadCalls).toEqual([]);
  });

  it("[TOOLCHAIN-DETECTION-02] cachedOnly 读到先前检测的结果，仍不起进程", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0" });
    await resolveWith(h, h.service.check({ requires: nodeOnly() }));
    const before = h.spawnedArgv().length;

    const cached = await h.service.check({ requires: nodeOnly(), cachedOnly: true });
    expect(cached.tools[0]).toMatchObject({ tool: "node", status: "found", version: "24.21.0" });
    expect(h.spawnedArgv()).toHaveLength(before);
  });

  it("[TOOLCHAIN-DETECTION-02] cachedOnly 按当前请求的范围重新判断缓存里的版本", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "20.10.0" });
    await resolveWith(h, h.service.check({ requires: nodeOnly(">=20") }));

    const cached = await h.service.check({ requires: nodeOnly(">=22"), cachedOnly: true });
    expect(cached.tools[0]?.status).toBe("too-old");
  });

  it("[TOOLCHAIN-DETECTION-03] 工具缺失：报 TOOL_MISSING，没有执行任何安装命令", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0" });
    h.fake.tools.missing("go");

    const result = await resolveWith(
      h,
      h.service.check({ requires: { go: { version: ">=1.24" }, node: { version: ">=20" } } }),
    );

    expect(result.errors).toEqual([
      expect.objectContaining({ code: "TOOL_MISSING", params: { tool: "go", required: ">=1.24" } }),
    ]);
    // 启动过的进程只有版本命令
    expect(h.spawnedArgv()).toEqual([[fakePath("node"), "--version"]]);
  });

  it("[TOOLCHAIN-DETECTION-03] 版本命令的环境关掉 uv 和 Go 的自动下载", async () => {
    const h = createToolchainHarness();
    h.fake.env.runDefaults = { UV_PYTHON_DOWNLOADS: "never", GOTOOLCHAIN: "local" };
    h.fake.tools.install("go", { version: "1.26.0" });

    await resolveWith(h, h.service.check({ requires: { go: { version: ">=1.24" } } }));

    expect(h.fake.processes.spawned[0]?.env).toMatchObject({
      UV_PYTHON_DOWNLOADS: "never",
      GOTOOLCHAIN: "local",
    });
  });
});

describe("只有执行版本命令并解析出版本号才算找到", () => {
  it("[TOOLCHAIN-DETECTION-04] 能解析出版本号：已找到，带版本和真实路径", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0", versionOutput: "v24.21.0\n" });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.tools[0]).toMatchObject({
      tool: "node",
      status: "found",
      version: "24.21.0",
      path: fakePath("node"),
      source: "login-shell",
    });
  });

  it("[TOOLCHAIN-DETECTION-05] 文件在但版本命令失败：判为未找到", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0", versionCommandFails: true });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.tools[0]?.status).toBe("missing");
    expect(result.errors[0]?.code).toBe("TOOL_MISSING");
  });

  it("[TOOLCHAIN-DETECTION-05] 输出里解析不出版本号：判为未找到", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0", versionOutput: "command not found\n" });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.tools[0]?.status).toBe("missing");
  });

  it("[TOOLCHAIN-DETECTION-05] 版本命令卡住：超时后结束它，判为未找到", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0" });
    h.fake.processes.when([fakePath("node"), "--version"], {});

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.tools[0]?.status).toBe("missing");
    expect(h.fake.processes.alive()).toEqual([]);
  });

  it("[TOOLCHAIN-DETECTION-06] Go 用 go version，没有执行 go --version", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("go", { version: "1.26.0" });

    const result = await resolveWith(
      h,
      h.service.check({ requires: { go: { version: ">=1.24" } } }),
    );

    expect(result.tools[0]).toMatchObject({ status: "found", version: "1.26.0" });
    expect(h.spawnedArgv()).toEqual([[fakePath("go"), "version"]]);
  });

  it("python 按工具定义里的可执行文件名依次找（python3 在前）", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("python3", { version: "3.12.4", versionOutput: "Python 3.12.4\n" });
    const requires = { python: { version: ">=3.12 <3.15" } };
    // 平台层按名字找候选；harness 的假工具表以名字登记
    const result = await resolveWith(h, h.service.check({ requires }));

    expect(result.tools[0]).toMatchObject({ status: "found", version: "3.12.4" });
  });
});

describe("版本范围的判定", () => {
  it("[TOOLCHAIN-DETECTION-08] 版本低于下限：TOOL_TOO_OLD，参数含工具名、范围和当前版本", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "20.10.0" });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: "TOOL_TOO_OLD",
      params: { tool: "node", required: ">=20.19 <27", found: "20.10.0" },
    });
    expect(result.tools[0]?.status).toBe("too-old");
  });

  it("[TOOLCHAIN-DETECTION-09] 版本高于上限：照常运行，带“未经测试”提醒，不是错误", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "28.0.0" });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.errors).toEqual([]);
    expect(result.tools[0]).toMatchObject({ status: "found", untested: true, version: "28.0.0" });
    expect(result.notices).toContainEqual({
      code: "TOOL_VERSION_UNTESTED",
      params: { tool: "node", found: "28.0.0", required: ">=20.19 <27" },
    });
  });

  it("范围之内：没有错误也没有提醒", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0" });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
  });

  it("[TOOLCHAIN-DETECTION-10] 没有 pnpm 回退 npm：不报错，给 PACKAGE_MANAGER_FALLBACK", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("npm", { version: "10.9.0" });
    h.fake.tools.missing("pnpm");

    const result = await resolveWith(
      h,
      h.service.check({ requires: { pnpm: { version: ">=10", fallback: "npm" } } }),
    );

    expect(result.errors).toEqual([]);
    expect(result.fallbacks).toEqual([{ wanted: "pnpm", used: "npm" }]);
    expect(result.notices).toContainEqual({
      code: "PACKAGE_MANAGER_FALLBACK",
      params: { wanted: "pnpm", used: "npm" },
    });
    expect(result.tools.find((t) => t.tool === "npm")).toMatchObject({ status: "found" });
  });

  it("[TOOLCHAIN-DETECTION-10] pnpm 在时不回退，也不去检测 npm", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("pnpm", { version: "10.4.0" });
    h.fake.tools.install("npm", { version: "10.9.0" });

    const result = await resolveWith(
      h,
      h.service.check({ requires: { pnpm: { version: ">=10", fallback: "npm" } } }),
    );

    expect(result.fallbacks).toEqual([]);
    expect(result.notices).toEqual([]);
    expect(result.tools.map((t) => t.tool)).toEqual(["pnpm"]);
  });
});

describe("手动指定的路径优先", () => {
  it("[TOOLCHAIN-DETECTION-11] 指定路径覆盖自动找到的 Node 20", async () => {
    const manual = absPath("/opt/node24/bin/node");
    const h = createToolchainHarness({ toolPaths: { node: manual } });
    h.fake.tools.install("node", { version: "20.19.0" });
    h.fake.processes.when([manual, "--version"], {
      output: [{ atMs: 0, stream: "stdout", data: "v24.1.0\n" }],
      exit: { afterMs: 0, code: 0 },
    });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.tools[0]).toMatchObject({ version: "24.1.0", path: manual });
    expect(h.spawnedArgv()[0]).toEqual([manual, "--version"]);
  });

  it("[TOOLCHAIN-DETECTION-11] 指定的路径执行不了时，退回自动查找", async () => {
    const manual = absPath("/opt/broken/node");
    const h = createToolchainHarness({ toolPaths: { node: manual } });
    h.fake.tools.install("node", { version: "24.21.0" });
    h.fake.processes.when([manual, "--version"], { exit: { afterMs: 0, code: 1 } });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.tools[0]).toMatchObject({ status: "found", path: fakePath("node") });
  });

  it("手动路径不是绝对路径时忽略它", async () => {
    const h = createToolchainHarness({ toolPaths: { node: "node" } });
    h.fake.tools.install("node", { version: "24.21.0" });

    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));

    expect(result.tools[0]?.path).toBe(fakePath("node"));
  });
});

describe("缓存的结构", () => {
  it("每次检测后交出可写入 state/toolchain.json 的结构", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0" });

    await resolveWith(h, h.service.check({ requires: nodeOnly(), cwd: project }));

    const file = h.cacheWrites.at(-1);
    expect(file?.formatVersion).toBe(1);
    expect(file?.entries.global?.tools[0]).toMatchObject({ tool: "node", version: "24.21.0" });
    expect(file?.entries.global?.checkedAt).toBe(h.fake.clock.now());
  });

  it("项目里有版本文件时单独缓存，没有的共用全局", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0" });
    h.fake.fs.writeFile(absPath("/fake/project/.node-version"), "22\n");

    await resolveWith(h, h.service.check({ requires: nodeOnly(), cwd: project }));
    await resolveWith(h, h.service.check({ requires: nodeOnly(), cwd: absPath("/fake/other") }));

    expect(Object.keys(h.service.snapshot().entries).sort()).toEqual([
      "global",
      "project:/fake/project",
    ]);
  });

  it("启动时读到的缓存可以直接被 cachedOnly 用", async () => {
    const h = createToolchainHarness({
      initialCache: {
        formatVersion: 1,
        entries: {
          global: {
            checkedAt: 1,
            tools: [{ tool: "node", status: "found", version: "24.21.0", path: "/n/node" }],
          },
        },
      },
    });

    const result = await h.service.check({ requires: nodeOnly(), cachedOnly: true });

    expect(result.tools[0]).toMatchObject({ status: "found", version: "24.21.0" });
    expect(await h.service.isCacheFresh()).toBe(false);
  });
});
