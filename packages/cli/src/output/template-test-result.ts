import type { TemplateTestResult } from "@runyard/core";
import type { Translate } from "@runyard/i18n";
import { CliError } from "../cli-error.ts";
import { englishErrorFields } from "./error-text.ts";

/** 步骤错误沿用命令行英文JSON约定，不外发内部debug和堆栈。 */
export function templateTestJson(result: TemplateTestResult, t: Translate) {
  return {
    ...result,
    runs: result.runs.map((run) => ({
      ...run,
      steps: run.steps.map((step) => {
        const { error, ...rest } = step;
        return {
          ...rest,
          ...(error === undefined
            ? {}
            : {
                error: {
                  code: error.code,
                  ...englishErrorFields(t, new CliError(error.code, error.params)),
                  data: error.params,
                  ...(error.cause === undefined ? {} : { cause: error.cause }),
                },
              }),
        };
      }),
    })),
  };
}
