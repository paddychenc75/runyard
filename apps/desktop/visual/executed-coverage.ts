interface Attachment {
  name: string;
  body?: string;
}
interface Result {
  status: string;
  attachments?: Attachment[];
}
interface Suite {
  specs?: { tests: { results: Result[] }[] }[];
  suites?: Suite[];
}

/** 只接受成功测试末尾的覆盖附件；登记过、跳过或失败都不能当成已执行。 */
export function completedScreens(report: { suites: Suite[] }): Set<string> {
  const completed = new Set<string>();
  const walk = (suite: Suite) => {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests)
        for (const result of test.results) {
          if (result.status !== "passed") continue;
          for (const attachment of result.attachments ?? []) {
            if (attachment.name !== "screen-coverage" || attachment.body === undefined) continue;
            const value = JSON.parse(Buffer.from(attachment.body, "base64").toString("utf8")) as {
              scene: string;
              theme: string;
              locale: string;
            };
            completed.add(`${value.scene}-${value.theme}-${value.locale}`);
          }
        }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites) walk(suite);
  return completed;
}
export function missingScreens(
  expected: readonly string[],
  completed: ReadonlySet<string>,
): string[] {
  return expected
    .filter((name) => !completed.has(name))
    .map((name) => `画面组合${name}没有成功扫描及截图比对的执行证据。`);
}
