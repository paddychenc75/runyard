import { expect, it } from "vitest";
import { completedScreens, missingScreens } from "./executed-coverage.ts";

const attachment = {
  name: "screen-coverage",
  body: Buffer.from(JSON.stringify({ scene: "Main", theme: "light", locale: "en-XA" })).toString(
    "base64",
  ),
};
it("故障注入：有清单但无成功执行、被跳过或失败都不得通过覆盖检查", () => {
  const expected = ["Main-light-en-XA"];
  for (const status of ["skipped", "failed", "timedOut"]) {
    const done = completedScreens({
      suites: [{ specs: [{ tests: [{ results: [{ status, attachments: [attachment] }] }] }] }],
    });
    expect(missingScreens(expected, done)).toHaveLength(1);
  }
  expect(missingScreens(expected, completedScreens({ suites: [] }))).toHaveLength(1);
});
it("成功比对后的附件才计入覆盖，缺组合仍失败", () => {
  const done = completedScreens({
    suites: [
      {
        suites: [
          { specs: [{ tests: [{ results: [{ status: "passed", attachments: [attachment] }] }] }] },
        ],
      },
    ],
  });
  expect(missingScreens(["Main-light-en-XA"], done)).toEqual([]);
  expect(missingScreens(["Main-dark-en"], done)).toHaveLength(1);
});
