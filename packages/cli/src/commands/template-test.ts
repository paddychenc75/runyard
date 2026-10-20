import { randomUUID } from "node:crypto";
import { testTemplate } from "@runyard/core";
import { cliCatalogs, createTranslator } from "@runyard/i18n";
import { CliError, usageError } from "../cli-error.ts";
import { readDoctorSettings } from "../doctor/read-settings.ts";
import { templateTestJson } from "../output/template-test-result.ts";
import { tempWorkspace } from "../template-test/temp-workspace.ts";
import { templateLocations } from "../templates/template-locations.ts";
import type { CommandHandler } from "./command-spec.ts";

export const templateTest: CommandHandler = async (context) => {
  const requested: Record<string, string> = {};
  for (const option of context.values("tool-version")) {
    const match = /^([a-z][a-z0-9-]*)=(\d+\.\d+(?:\.\d+)?)$/.exec(option);
    if (!match?.[1] || !match[2])
      throw usageError((t) =>
        t("cli.usage.invalidValue.body", { option: "tool-version", value: option }),
      );
    requested[match[1]] = match[2];
  }
  const settings = await readDoctorSettings(context.platform);
  const abort = new AbortController();
  const disposeCancel = context.host.onCancel?.(() => abort.abort());
  const result = await testTemplate({
    signal: abort.signal,
    template: context.positionals[0] ?? "",
    platform: context.platform,
    clock: context.host.clock,
    locations: templateLocations(context.platform, context.host),
    appVersion: context.host.install.version,
    workspace: tempWorkspace(context.host.tempDir),
    marker: `template-test-${randomUUID()}`,
    keepDir: context.flag("keep-dir"),
    toolVersions: requested,
    toolPaths: settings.toolPaths,
  }).finally(() => disposeCancel?.());
  context.out.result(
    templateTestJson(
      result,
      createTranslator({ locale: "en", platform: context.platform.id, catalogs: cliCatalogs }).t,
    ),
    result.runs.flatMap((run) =>
      run.steps.map((step) =>
        context.t("cli.templateTest.step.body", {
          step: step.step,
          status: step.ok ? "ok" : "failed",
          ms: step.ms,
        }),
      ),
    ),
  );
  const failure = result.runs.flatMap((run) => run.steps).find((step) => !step.ok)?.error;
  if (failure) throw new CliError(failure.code, failure.params, { cause: failure.cause });
};
