import { mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchRunyard } from "./support/launch.ts";
import {
  armTiming,
  closeInitialPicker,
  finishTiming,
  placeAtTemplate,
  restoreModel,
} from "./vue-acceptance/browser.ts";
import {
  assertGone,
  createProject,
  fileHashes,
  languageProcesses,
  packageFiles,
  prepareDependencies,
} from "./vue-acceptance/fixture.ts";

const executable = process.env.RUNYARD_E2E_APP;
if (!executable) throw new Error("设置 RUNYARD_E2E_APP 指向打包应用");
const output =
  process.env.RUNYARD_VUE_ACCEPTANCE_OUT ?? mkdtempSync(join(tmpdir(), "ry-vue-acceptance-"));
mkdirSync(output, { recursive: true });
console.log(`Vue 实测输出：${output}`);
packageFiles(executable);
const dependencies = await prepareDependencies(output);
if (process.env.RUNYARD_VUE_MEASURE_MODE === "prepare") {
  console.log(dependencies);
  process.exit(0);
}
const results: unknown[] = [];
const realUserState = join(process.env.HOME ?? "", ".runyard");
const homeBefore = statSync(realUserState, { throwIfNoEntry: false })?.mtimeMs ?? null;
for (const size of [0, 500])
  for (let repetition = 1; repetition <= 3; repetition++) {
    const instance = await launchRunyard({ lang: "en", theme: "light" });
    let processes: Awaited<ReturnType<typeof languageProcesses>> = [];
    try {
      await closeInitialPicker(instance.page);
      await instance.call("settings.set", { autoSave: "off" });
      const settings = await instance.call<{ autoSave: string }>("settings.get");
      if (settings.autoSave !== "off") throw new Error("测量前必须关闭自动保存");
      const project = await createProject(
        instance,
        `vue-${size}-${repetition}`,
        dependencies,
        size || undefined,
      );
      const before = fileHashes(project.folder);
      await armTiming(instance.page, "cold");
      await instance.call("tab.openWithoutRun", project.id);
      await placeAtTemplate(instance.page);
      await instance.page.keyboard.type("<Child ");
      const first = await finishTiming(instance.page);
      await instance.page.keyboard.press("Escape");
      await armTiming(instance.page, "warm");
      await instance.page.keyboard.type(":");
      const warm = await finishTiming(instance.page);
      processes = await languageProcesses(instance);
      const after = fileHashes(project.folder);
      const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
        (path) => before[path] !== after[path],
      );
      const row = {
        size: project.count,
        repetition,
        first,
        warm,
        processes,
        changed,
        firstPass: first.openToPaint <= 2000,
        warmPass: warm.keyToPaint <= 300,
      };
      results.push(row);
      writeFileSync(join(output, "performance.json"), JSON.stringify(results, null, 2));
      console.log(JSON.stringify(row));
      if (changed.length) throw new Error("性能测量期间项目文件发生变化");
      await restoreModel(instance.page);
    } catch (error) {
      const prefix = `failed-${size}-${repetition}`;
      await instance.page.screenshot({ path: join(output, `${prefix}.png`) });
      writeFileSync(
        join(output, `${prefix}.json`),
        JSON.stringify(
          {
            error: String(error),
            text: await instance.page.locator("body").innerText(),
            processes: await languageProcesses(instance),
          },
          null,
          2,
        ),
      );
      await restoreModel(instance.page);
      throw error;
    } finally {
      await instance.shutdown();
      await assertGone(instance, processes);
    }
  }
const homeAfter = statSync(realUserState, { throwIfNoEntry: false })?.mtimeMs ?? null;
writeFileSync(
  join(output, "real-home.json"),
  JSON.stringify({ homeBefore, homeAfter, unchanged: homeBefore === homeAfter }),
);
console.log(`完成：${output}`);
