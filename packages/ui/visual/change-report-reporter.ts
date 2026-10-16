import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { buildChangeReport, type ChangeEntry } from "./change-report.ts";

// Playwright 报告器：把失败的测试收集成“界面变更对照页”（change-report.ts）。
// 测试用三条注解（component、theme-label 即中文组合名）告诉它标题怎么写。

interface Options {
  outputFile: string;
}

const dataUri = (path: string | undefined): string | undefined =>
  path === undefined ? undefined : `data:image/png;base64,${readFileSync(path).toString("base64")}`;

export default class ChangeReportReporter implements Reporter {
  private readonly entries: ChangeEntry[] = [];
  private readonly outputFile: string;

  constructor(options: Options) {
    this.outputFile = options.outputFile;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === "passed" || result.status === "skipped") return;
    const note = (type: string) =>
      test.annotations.find((annotation) => annotation.type === type)?.description ?? "";
    const attachment = (suffix: string) =>
      result.attachments.find(
        (item) => item.name.endsWith(`-${suffix}.png`) && item.path !== undefined,
      )?.path;
    const base = { component: note("component") || test.title, combination: note("combination") };
    const actual = attachment("actual");
    if (actual !== undefined) {
      this.entries.push({
        ...base,
        before: dataUri(attachment("expected")),
        diff: dataUri(attachment("diff")),
        after: dataUri(actual),
      });
    } else {
      const message = result.errors.map((error) => error.message ?? "").join("\n");
      this.entries.push({ ...base, problem: stripVTControlCharacters(message) });
    }
  }

  onEnd(): void {
    if (this.entries.length === 0) return;
    mkdirSync(dirname(this.outputFile), { recursive: true });
    writeFileSync(this.outputFile, buildChangeReport(this.entries));
  }

  printsToStdio(): boolean {
    return false;
  }
}
