import { realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { installVueAudit, readVueAudit } from "../src/main/integration/vue-test-support/audit.ts";
import { launchRunyard } from "./support/launch.ts";
import { AUDIT_OBSERVER } from "./vue-acceptance/audit-observer.ts";
import {
  armTiming,
  closeInitialPicker,
  finishTiming,
  inspectAndCompose,
  placeAtTemplate,
  restoreModel,
} from "./vue-acceptance/browser.ts";
import {
  assertGone,
  command,
  createProject,
  fileHashes,
  languageProcesses,
  packageFiles,
  prepareDependencies,
} from "./vue-acceptance/fixture.ts";

const output = process.env.RUNYARD_VUE_ACCEPTANCE_OUT;
const executable = process.env.RUNYARD_E2E_APP;
if (!output || !executable) throw new Error("设置打包应用和实测输出目录");
const dependencies = await prepareDependencies(output);
const service = realpathSync(packageFiles(executable).service);
const rows = [];
for (let repetition = 1; repetition <= 3; repetition++) {
  const instance = await launchRunyard({ lang: "en", theme: "light" });
  let processes: Awaited<ReturnType<typeof languageProcesses>> = [];
  try {
    await closeInitialPicker(instance.page);
    await instance.call("settings.set", { autoSave: "off" });
    const project = await createProject(instance, `audit-${repetition}`, dependencies);
    const observer = join(project.folder, "audit-observer.cjs");
    writeFileSync(observer, AUDIT_OBSERVER);
    const before = fileHashes(project.folder);
    await instance.app.evaluate(installVueAudit, observer);
    const requests: string[] = [];
    instance.page.on("request", (request) => {
      if (!request.url().startsWith("app:")) requests.push(request.url());
    });
    await armTiming(instance.page, "audit");
    await instance.call("tab.openWithoutRun", project.id);
    await placeAtTemplate(instance.page);
    await instance.page.keyboard.type("<Child ");
    await finishTiming(instance.page);
    const composition = await inspectAndCompose(instance.page);
    processes = await languageProcesses(instance);
    const connections = [];
    for (const item of processes)
      connections.push({
        pid: item.pid,
        ...(await command(instance.platform, instance.home, [
          "/usr/sbin/lsof",
          "-a",
          "-p",
          String(item.pid),
          "-i",
          "-n",
          "-P",
        ])),
      });
    const events = (await instance.app.evaluate(readVueAudit)).map(
      (line) => JSON.parse(line) as { kind: string; name?: string; file?: string; ok?: boolean },
    );
    const within = (root: string, file: string) => {
      const child = relative(root, resolve(project.folder, file));
      return child === "" || (!child.startsWith("..") && !isAbsolute(child));
    };
    const outsideReads = events.filter(
      (event) =>
        event.ok &&
        event.file &&
        !event.file.startsWith("fd:") &&
        !within(project.folder, event.file) &&
        !within(service, event.file),
    );
    const writes = events.filter(
      (event) => event.ok && /write|append|mkdir|rename|unlink/i.test(event.name ?? ""),
    );
    const network = events.filter((event) => event.kind === "network");
    const after = fileHashes(project.folder);
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      (path) => before[path] !== after[path],
    );
    writeFileSync(join(output, `audit-events-${repetition}.json`), JSON.stringify(events, null, 2));
    const row = {
      repetition,
      composition,
      events: events.length,
      outsideReads,
      writes,
      network,
      requests,
      connections,
      changed,
    };
    rows.push(row);
    writeFileSync(join(output, "audit.json"), JSON.stringify(rows, null, 2));
    console.log(
      JSON.stringify({
        repetition,
        events: events.length,
        outsideReads: outsideReads.length,
        writes: writes.length,
        network: network.length,
        changed: changed.length,
      }),
    );
    if (
      events.filter((event) => event.kind === "ready").length !== 2 ||
      outsideReads.length ||
      writes.length ||
      network.length ||
      requests.length ||
      changed.length ||
      connections.some((item) => item.code !== 1 || item.stdout !== "" || item.stderr !== "")
    )
      throw new Error("安全观察不符合两进程启动、只读和无联网预期，请检查原始记录");
    await restoreModel(instance.page);
  } finally {
    await instance.shutdown();
    await assertGone(instance, processes);
  }
}
