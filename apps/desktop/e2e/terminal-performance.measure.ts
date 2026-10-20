import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { closePicker, expect, test } from "./support/fixtures.ts";
import {
  armTerminalProbe,
  finishTerminalProbe,
  terminalProgress,
} from "./support/terminal-performance-probe.ts";
import { armUiProbe, readUiProbe } from "./support/ui-performance-probe.ts";

const output = process.env.RUNYARD_PERF_OUTPUT;
if (!output || !process.env.RUNYARD_E2E_APP)
  throw new Error("请指定真实e2e包与独立RUNYARD_PERF_OUTPUT目录");
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

for (let sample = 1; sample <= 3; sample++) {
  test(`TERMINAL-24 真实大量输出同时编辑切文件 独立实例 ${sample}`, async ({ launch }) => {
    const instance = await launch();
    const { page } = instance;
    await closePicker(page);
    await instance.cli("new", "html", "terminal-load");
    const folder = join(instance.library, "terminal-load");
    writeFileSync(join(folder, "index.html"), "<h1>PERF_INDEX</h1>\n");
    writeFileSync(join(folder, "style.css"), "/* PERF_STYLE */\n");
    const source = join(instance.home, "producer.cjs");
    const producerOutput = join(output, `terminal-producer-${sample}.json`);
    copyFileSync(join(import.meta.dirname, "support", "terminal-load.fixture.cjs"), source);
    const state = () => instance.call<{ playgrounds: { id: string }[] }>("library.get");
    await expect.poll(async () => (await state()).playgrounds.length).toBe(1);
    const project = (await state()).playgrounds[0]?.id;
    if (!project) throw new Error("项目未创建");
    await instance.call("tab.openWithoutRun", project);
    await instance.call("settings.set", { autoSave: "off" });
    await page.getByRole("treeitem", { name: "style.css", exact: true }).click();
    await page.getByRole("treeitem", { name: "index.html", exact: true }).click();
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    await expect(page.locator(".xterm")).toBeVisible();
    // #528：xterm挂载不等于shell已就绪；先走真实输出握手，避免长命令开头被丢掉。
    await expect
      .poll(() => instance.call("terminal.attach", { project }))
      .toMatchObject({ state: { kind: "running" } });
    await page.locator(".xterm").click();
    await page.keyboard.type("printf 'PERF%s\\n' '-READY'");
    await page.keyboard.press("Enter");
    await expect(page.locator(".xterm")).toContainText("PERF-READY");
    await armTerminalProbe(page, project);
    await page.keyboard.type(
      `${quote(process.execPath)} ${quote(source)} ${quote(producerOutput)}`,
    );
    await page.keyboard.press("Enter");
    const interactions = [];
    for (let step = 1; step <= 9; step++) {
      await expect.poll(() => terminalProgress(page)).toBeGreaterThanOrEqual(step * 30000);
      const file = step % 2 ? "style.css" : "index.html";
      const needle = step % 2 ? "PERF_STYLE" : "PERF_INDEX";
      await armUiProbe(page, {
        key: "pointerdown",
        selector: ".monaco-editor .view-lines",
        needle,
      });
      let dispatched = performance.now();
      await page
        .getByRole("tab", { name: new RegExp(`^${file.replace(".", "\\.")}( \\(unsaved\\))?$`) })
        .click();
      const switched = await readUiProbe(page);
      const switchUpperMs = performance.now() - dispatched;
      await page.keyboard.press("Meta+End");
      const typed = `/*P${step}*/`;
      await armUiProbe(page, { key: "/", selector: ".monaco-editor .view-lines", needle: typed });
      dispatched = performance.now();
      await page.keyboard.type(typed);
      const edited = await readUiProbe(page);
      interactions.push({
        step,
        switched,
        switchUpperMs,
        edited,
        inputUpperMs: performance.now() - dispatched,
      });
    }
    await expect(page.locator(".xterm")).toContainText("PERFORMANCE_DONE:");
    const producer = JSON.parse(readFileSync(producerOutput, "utf8")) as {
      elapsedMs: number;
      lines: number;
      buckets: number[];
    };
    const renderer = await finishTerminalProbe(page);
    const retained = await instance.call<{ output: string }>("terminal.attach", { project });
    const result = {
      sample,
      producer,
      renderer,
      interactions,
      retainedLines: (retained.output.match(/^PERF_LINE:/gm) ?? []).length,
    };
    writeFileSync(join(output, `terminal-${sample}.json`), JSON.stringify(result, null, 2));
    await page.screenshot({ path: join(output, `terminal-${sample}.png`) });
    console.log("TERMINAL_PERFORMANCE", JSON.stringify(result));
    expect(producer.elapsedMs).toBeGreaterThanOrEqual(10000);
    expect(renderer.receivedLines).toBe(producer.lines);
    expect(renderer.visibleTail).toContain(`PERFORMANCE_DONE:${producer.lines}`);
    expect(result.retainedLines).toBeLessThanOrEqual(10000);
    // #534：性能窗口已经结束；真实保存两份修改，避免保存询问阻塞launch收尾。
    for (const name of [/^index\.html/, /^style\.css/]) {
      await page.getByRole("tab", { name }).click();
      await page.keyboard.press("Meta+s");
    }
    await expect(page.getByRole("tab", { name: /\(unsaved\)/ })).toHaveCount(0);
  });
}
