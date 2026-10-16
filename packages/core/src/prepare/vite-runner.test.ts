import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateRunner, validateTemplate } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import {
  at,
  createPrepareHarness,
  installArgv,
  installOk,
  spawnedArgvs,
  stopRun,
} from "./prepare-harness.test.ts";

// 用仓库里真实的 vite 运行器和 react19 模板的数据跑准备阶段（规格 templates/runners 的 Vite 一节）。
// 假平台上 pnpm 的版本要不低于模板声明的下限，所以每个用例都把它换成下限版本。

const templates = join(import.meta.dirname, "..", "..", "..", "..", "templates");
const read = (path: string): unknown => JSON.parse(readFileSync(join(templates, path), "utf8"));
const runner = validateRunner(read("runners/vite/runner.json")).value;
const template = validateTemplate(read("builtin/react19/template.json")).value;
if (runner === undefined || template === undefined)
  throw new Error("vite 运行器或 react19 模板不合格");

const npmInstallArgv = ["/fake/bin/npm", "install", "--prefer-offline", "--no-audit", "--no-fund"];
const viteArgv = (port: number) => [
  "/fake/bin/node",
  "node_modules/vite/bin/vite.js",
  "--port",
  String(port),
  "--strictPort",
  "--host",
  "127.0.0.1",
  "--clearScreen",
  "false",
];

function harness(tools: ("node" | "pnpm" | "npm")[] = ["node", "pnpm", "npm"]) {
  const h = createPrepareHarness({
    runner,
    requires: template?.requires ?? {},
    registeredPort: 7100,
    tools,
  });
  if (tools.includes("pnpm")) h.fake.tools.install("pnpm", { version: "10.34.6" });
  h.fake.tools.install("node", { version: "22.12.0" });
  return h;
}

describe("vite 运行器", () => {
  it("[TEMPLATES-RUNNERS-12] 命令不经包管理器：node 直接运行 Vite 的入口文件，监听 127.0.0.1，没有 --no-color", async () => {
    const h = harness();
    h.fake.processes.when(installArgv, installOk);
    h.fake.processes.when(viteArgv(7100), { listenOn: { port: 7100, atMs: 100 } });
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    expect(run.state).toBe("ready");
    const server = h.fake.processes.spawned.find((s) => s.argv.includes("--strictPort"));
    expect(server?.argv).toEqual(viteArgv(7100));
    expect(server?.argv.join(" ")).not.toMatch(/pnpm|npx|--no-color/);
    await stopRun(h, run);
  });

  it("[TEMPLATES-RUNNERS-14] 没有 pnpm 时用 npm 安装（带 --no-audit --no-fund），记一条 PACKAGE_MANAGER_FALLBACK，最终 ready", async () => {
    const h = harness(["node", "npm"]);
    h.fake.processes.when(npmInstallArgv, installOk);
    h.fake.processes.when(viteArgv(7100), { listenOn: { port: 7100, atMs: 100 } });
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    expect(run.state).toBe("ready");
    expect(spawnedArgvs(h)).toContain(npmInstallArgv.join(" "));
    expect(h.notices().filter((n) => n.code === "PACKAGE_MANAGER_FALLBACK")).toEqual([
      { code: "PACKAGE_MANAGER_FALLBACK", params: { wanted: "pnpm", used: "npm" } },
    ]);
    await stopRun(h, run);
  });

  // 前几条里带 pnpm、npm 错误码的是 2026-10-16 在 macOS 上用 pnpm 11.28.0 和 npm 11.20.0 实际触发出来的输出（节选），
  // ENOTFOUND 是 Node 的网络错误码（规格里的写法）
  const offlineOutputs: [string, string][] = [
    ["ENOTFOUND", "npm error code ENOTFOUND\nnpm error syscall getaddrinfo\n"],
    [
      "ERR_PNPM_META_FETCH_FAIL",
      "[ERR_PNPM_META_FETCH_FAIL] GET http://127.0.0.1:1/@oxc-project%2Ftypes: fetch failed\n",
    ],
    [
      "ERR_PNPM_NO_OFFLINE_META",
      "[ERR_PNPM_NO_OFFLINE_META] Failed to resolve @oxc-project/types in package mirror /Users/x/Library/Caches/pnpm/v11/metadata-full/https%3A+registry.npmjs.org/@oxc-project/types.jsonl\n",
    ],
    [
      "ERR_PNPM_NO_OFFLINE_TARBALL",
      "[ERR_PNPM_NO_OFFLINE_TARBALL] A package is missing from the store but cannot download it in offline mode.\n",
    ],
    [
      "ENOTCACHED",
      "npm error code ENOTCACHED\nnpm error request to https://registry.npmjs.org/vite/-/vite-8.3.3.tgz failed\n",
    ],
    ["ECONNREFUSED", "npm error code ECONNREFUSED\nnpm error errno ECONNREFUSED\n"],
  ];

  for (const [name, output] of offlineOutputs) {
    it(`[TEMPLATES-RUNNERS-15] 离线且依赖未缓存：输出里有 ${name} 判为 DEPS_OFFLINE，项目文件原样保留`, async () => {
      const h = harness();
      h.fake.processes.when(installArgv, {
        output: [{ atMs: 0, stream: "stderr", data: output }],
        exit: { afterMs: 5, code: 1 },
      });
      const { run } = h.engine.start(h.request());
      await h.advance(200);
      expect(run.state).toBe("failed");
      expect(run.error()?.code).toBe("DEPS_OFFLINE");
      expect(h.fake.fs.exists(at("package.json"))).toBe(true);
    });
  }

  const setupFailures: [string, string][] = [
    [
      "ERR_PNPM_IGNORED_BUILDS",
      '[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.27.0\n\nRun "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.\n',
    ],
    [
      "ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION",
      "[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 28 lockfile entries failed verification:\n  react@19.3.0 was published within the minimumReleaseAge cutoff\n",
    ],
  ];

  for (const [code, output] of setupFailures) {
    it(`[TEMPLATES-RUNNERS-17] ${code} 判为 SETUP_FAILED，cause.outputTail 带 pnpm 的原文`, async () => {
      const h = harness();
      h.fake.processes.when(installArgv, {
        output: [{ atMs: 0, stream: "stderr", data: output }],
        exit: { afterMs: 5, code: 1 },
      });
      const { run } = h.engine.start(h.request());
      await h.advance(200);
      expect(run.state).toBe("failed");
      expect(run.error()).toMatchObject({
        code: "SETUP_FAILED",
        cause: { exitCode: 1, outputTail: expect.stringContaining(code) },
      });
    });
  }
});
