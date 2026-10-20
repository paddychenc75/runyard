import type { RunKind, RunyardError, TemplateTestStep } from "@runyard/protocol";
import type { RunClock } from "../run/run-clock.ts";

export interface TemplateTestStepResult {
  step: TemplateTestStep;
  ok: boolean;
  ms: number;
  error?: RunyardError;
}
export interface TemplateTestRun {
  toolVersions: Record<string, string>;
  steps: TemplateTestStepResult[];
  ok: boolean;
}
export interface TemplateTestResult {
  template: string;
  ok: boolean;
  runs: TemplateTestRun[];
  keptDir?: string;
}
export interface TemplateTestDriver {
  kind(): RunKind;
  versions(): Record<string, string>;
  step(step: TemplateTestStep): Promise<void>;
  dispose(keep: boolean): Promise<string | undefined>;
}

function failure(error: unknown, template: string, step: TemplateTestStep): RunyardError {
  if (error && typeof error === "object" && "error" in error) return error.error as RunyardError;
  return {
    code: "TEMPLATE_TEST_FAILED",
    params: { template, step },
    debug: error instanceof Error ? error.message : "template test failed",
  };
}

/** 冒烟失败也继续停止、核对残留和清理；调用方按首个失败步骤的错误码选择退出码。 */
export async function testWorkflow(
  template: string,
  driver: TemplateTestDriver,
  clock: RunClock,
  keep = false,
): Promise<TemplateTestResult> {
  const run: TemplateTestRun = { toolVersions: {}, steps: [], ok: true };
  const record = async (step: TemplateTestStep) => {
    const began = clock.now();
    try {
      await driver.step(step);
      run.steps.push({ step, ok: true, ms: clock.now() - began });
      return true;
    } catch (thrown) {
      const error = failure(thrown, template, step);
      const actual =
        step === "install" && (error.code === "TOOL_MISSING" || error.code === "TOOL_TOO_OLD")
          ? "start"
          : step;
      run.steps.push({ step: actual, ok: false, ms: clock.now() - began, error });
      run.ok = false;
      return false;
    }
  };
  try {
    if ((await record("create")) && (await record("install")) && (await record("start"))) {
      if (driver.kind() === "oneshot" || (await record("ready"))) await record("reload");
    }
  } finally {
    await record("stop");
    await record("leftovers");
  }
  run.toolVersions = driver.versions();
  let keptDir: string | undefined;
  try {
    keptDir = await driver.dispose(keep);
  } catch (error) {
    run.ok = false;
    run.steps.push({
      step: "leftovers",
      ok: false,
      ms: 0,
      error: failure(error, template, "leftovers"),
    });
  }
  return { template, ok: run.ok, runs: [run], ...(keptDir === undefined ? {} : { keptDir }) };
}
