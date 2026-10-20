import { expect, it } from "vitest";
import { libraryError } from "../library/library-error.ts";
import { type TemplateTestDriver, testWorkflow } from "./test-workflow.ts";

const clock = { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} };
function driver(
  options: { script?: boolean; fail?: string; code?: "TOOL_MISSING" | "DEPS_OFFLINE" } = {},
) {
  const calls: string[] = [];
  const value: TemplateTestDriver = {
    kind: () => (options.script ? "oneshot" : "server"),
    versions: () => ({ node: "22.18.0" }),
    step: async (step) => {
      calls.push(step);
      if (step === options.fail) {
        if (options.code === "TOOL_MISSING")
          throw libraryError("TOOL_MISSING", { tool: "go", required: ">=1.26" }, "missing");
        if (options.code === "DEPS_OFFLINE")
          throw libraryError("DEPS_OFFLINE", { name: "test" }, "offline");
        throw new Error("probe failed");
      }
    },
    dispose: async (keep) => {
      calls.push(keep ? "keep" : "remove");
      return keep ? "/system-temp/owned" : undefined;
    },
  };
  return { value, calls };
}
it("[TEMPLATES-FORMAT-43] 服务流程按创建安装启动就绪重载停止残留执行，真实模板另由CI冒烟验证", async () => {
  const d = driver();
  const result = await testWorkflow("react19", d.value, clock);
  expect(result.ok).toBe(true);
  expect(d.calls).toEqual([
    "create",
    "install",
    "start",
    "ready",
    "reload",
    "stop",
    "leftovers",
    "remove",
  ]);
});
it("[TEMPLATES-FORMAT-44] 脚本没有ready步骤", async () => {
  const d = driver({ script: true });
  const result = await testWorkflow("python", d.value, clock);
  expect(result.runs[0]?.steps.map((s) => s.step)).toEqual([
    "create",
    "install",
    "start",
    "reload",
    "stop",
    "leftovers",
  ]);
});
async function failedCleanup(step: string) {
  const d = driver({ fail: step });
  const result = await testWorkflow("demo", d.value, clock);
  expect(result.ok).toBe(false);
  expect(result.runs[0]?.steps.find((s) => !s.ok)?.error?.code).toBe("TEMPLATE_TEST_FAILED");
  expect(d.calls).toContain("stop");
  expect(d.calls.at(-1)).toBe("remove");
}
it("[TEMPLATES-FORMAT-45] 重载失败仍执行停止与清理", () => failedCleanup("reload"));
it("[TEMPLATES-FORMAT-46] 残留进程失败仍执行停止与清理", () => failedCleanup("leftovers"));
it("[TEMPLATES-FORMAT-47] 缺工具归到start步骤且保留原码", async () => {
  const result = await testWorkflow(
    "go",
    driver({ fail: "install", code: "TOOL_MISSING" }).value,
    clock,
  );
  expect(result.runs[0]?.steps.find((s) => !s.ok)).toMatchObject({
    step: "start",
    error: { code: "TOOL_MISSING" },
  });
});
it("[TEMPLATES-FORMAT-48] 离线依赖失败归到install", async () => {
  const result = await testWorkflow(
    "react19",
    driver({ fail: "install", code: "DEPS_OFFLINE" }).value,
    clock,
  );
  expect(result.runs[0]?.steps.find((s) => !s.ok)).toMatchObject({
    step: "install",
    error: { code: "DEPS_OFFLINE" },
  });
});
it("[TEMPLATES-FORMAT-49] 保留目录与实际工具版本进入结果", async () => {
  const result = await testWorkflow("node-ts", driver().value, clock, true);
  expect(result).toMatchObject({
    keptDir: "/system-temp/owned",
    runs: [{ toolVersions: { node: "22.18.0" } }],
  });
});
