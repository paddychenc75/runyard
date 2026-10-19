import { readFileSync } from "node:fs";
import { join } from "node:path";
import { combinations } from "../../../packages/ui/visual/matrix.ts";
import { completedScreens, missingScreens } from "./executed-coverage.ts";
import { scenes } from "./scenes.ts";

const report = JSON.parse(
  readFileSync(join(import.meta.dirname, ".output", "results.json"), "utf8"),
) as Parameters<typeof completedScreens>[0];
const expected = scenes.flatMap((scene) =>
  combinations.map((item) => `${scene.id}-${item.theme}-${item.locale}`),
);
const errors = missingScreens(expected, completedScreens(report));
for (const error of errors) console.error(error);
if (errors.length) process.exitCode = 1;
else console.log(`画面执行覆盖通过：${expected.length}个组合。`);
