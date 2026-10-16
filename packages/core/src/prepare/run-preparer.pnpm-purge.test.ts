import { describe, expect, it } from "vitest";
import {
  createPrepareHarness,
  installArgv,
  installOk,
  serveOn,
  spawnedArgvs,
} from "./prepare-harness.test.ts";

// 真实输出：pnpm 11.28.0，无终端（标准输入不是 TTY），node_modules 由另一个存储目录装出来、
// 依赖版本变了需要重装。在临时目录里复现，标准输出原文，退出码 1。
const PNPM_PURGE_NO_TTY_OUTPUT = [
  "[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] Aborted removal of modules directory due to no TTY",
  "",
  'If you are running pnpm in CI, set the CI environment variable to "true", or set "confirmModulesPurge" to "false".',
  "",
].join("\n");

const retryArgv = [...installArgv, "--config.confirmModulesPurge=false"];
const installCommands = (h: Parameters<typeof spawnedArgvs>[0]) =>
  spawnedArgvs(h).filter((line) => line.includes(" install"));

function purgeRefused() {
  return {
    output: [{ atMs: 0, stream: "stdout" as const, data: PNPM_PURGE_NO_TTY_OUTPUT }],
    exit: { afterMs: 5, code: 1 },
  };
}

describe("pnpm 没有终端时要确认清空依赖目录", () => {
  it("[TEMPLATES-RUNNERS-16] 带 --config.confirmModulesPurge=false 重试一次并成功，环境里没有 CI", async () => {
    const h = createPrepareHarness({ registeredPort: 7100 });
    h.fake.processes.when(installArgv, purgeRefused());
    h.fake.processes.when(retryArgv, installOk);
    serveOn(h, 7100);
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    expect(run.state).toBe("ready");
    expect(installCommands(h)).toEqual([installArgv.join(" "), retryArgv.join(" ")]);
    for (const spawned of h.fake.processes.spawned.filter((s) => s.argv.includes("install"))) {
      expect(spawned.env.CI).toBeUndefined();
    }
  });

  it("[TEMPLATES-RUNNERS-16] 重试仍失败：不再重试，按原来的错误报告", async () => {
    const h = createPrepareHarness();
    h.fake.processes.when(installArgv, purgeRefused());
    h.fake.processes.when(retryArgv, {
      output: [{ atMs: 0, stream: "stderr", data: "ERR_PNPM_BROKEN something broke\n" }],
      exit: { afterMs: 5, code: 1 },
    });
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    expect(run.state).toBe("failed");
    expect(run.error()).toMatchObject({
      code: "SETUP_FAILED",
      cause: { exitCode: 1, outputTail: expect.stringContaining("something broke") },
    });
    expect(installCommands(h)).toHaveLength(2);
  });

  it("[TEMPLATES-RUNNERS-16] 第二次仍是同一个提示：也只重试这一次", async () => {
    const h = createPrepareHarness();
    h.fake.processes.when(installArgv, purgeRefused());
    h.fake.processes.when(retryArgv, purgeRefused());
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    expect(run.error()?.code).toBe("SETUP_FAILED");
    expect(installCommands(h)).toHaveLength(2);
  });

  it("[TEMPLATES-RUNNERS-16] 别的 pnpm 错误不重试", async () => {
    const h = createPrepareHarness();
    h.fake.processes.when(installArgv, {
      output: [{ atMs: 0, stream: "stderr", data: "ERR_PNPM_IGNORED_BUILDS nope\n" }],
      exit: { afterMs: 5, code: 1 },
    });
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    expect(run.error()?.code).toBe("SETUP_FAILED");
    expect(installCommands(h)).toEqual([installArgv.join(" ")]);
  });
});
