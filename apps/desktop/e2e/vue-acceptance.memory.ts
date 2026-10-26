import { writeFileSync } from "node:fs";
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
  type LanguageProcessSample,
  languageProcesses,
  prepareDependencies,
} from "./vue-acceptance/fixture.ts";

const output = process.env.RUNYARD_VUE_ACCEPTANCE_OUT;
if (!output || !process.env.RUNYARD_E2E_APP) throw new Error("设置打包应用和实测输出目录");
const dependencies = await prepareDependencies(output);
const results: unknown[] = [];
for (let repetition = 1; repetition <= 3; repetition++) {
  const instance = await launchRunyard({ lang: "en", theme: "light" });
  const seen = new Map<number, LanguageProcessSample>();
  try {
    await closeInitialPicker(instance.page);
    await instance.call("settings.set", { autoSave: "off" });
    const projects: Awaited<ReturnType<typeof createProject>>[] = [];
    for (let index = 1; index <= 3; index++)
      projects.push(await createProject(instance, `memory-${repetition}-${index}`, dependencies));
    const before = projects.map((project) => fileHashes(project.folder));
    const stages = [];
    for (const [index, project] of projects.entries()) {
      await armTiming(instance.page, "memory");
      await instance.call("tab.openWithoutRun", project.id);
      await placeAtTemplate(instance.page);
      await instance.page.keyboard.type("<Child ");
      await finishTiming(instance.page);
      const processes = await languageProcesses(instance);
      for (const item of processes) seen.set(item.pid, item);
      if (processes.length !== Math.min(index + 1, 2) * 2)
        throw new Error("语言服务进程数量不符合两组上限");
      if (index === 2) {
        const oldest = [...seen.values()].filter((item) => item.project === projects[0]?.folder);
        if (oldest.length !== 2) throw new Error("没有捕获第一组语言服务身份");
        await assertGone(instance, oldest);
        if (processes.some((item) => item.project === projects[0]?.folder))
          throw new Error("第三个项目没有淘汰最久未用的组");
      }
      stages.push({
        opened: index + 1,
        processes,
        rssKiB: processes.reduce((sum, item) => sum + item.rssKiB, 0),
      });
      await restoreModel(instance.page);
    }
    const changed = projects.flatMap((project, index) => {
      const after = fileHashes(project.folder);
      const original = before[index] ?? {};
      return [...new Set([...Object.keys(original), ...Object.keys(after)])]
        .filter((path) => original[path] !== after[path])
        .map((path) => `${project.id}:${path}`);
    });
    const row = { repetition, stages, changed };
    results.push(row);
    writeFileSync(join(output, "memory.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(row));
    if (changed.length) throw new Error("内存测量期间项目文件发生变化");
  } finally {
    await instance.shutdown();
    await assertGone(instance, [...seen.values()]);
  }
}
