import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base, expect } from "@playwright/test";
import { collectPageTexts, findLeakedText, pseudoLocale } from "@runyard/i18n";
import { buildWorkbench } from "../workbench/build.ts";
import { combinationLabel } from "./labels.ts";
import { combinations, listComponents, snapshotName } from "./matrix.ts";
import { findOverflows } from "./overflow-scan.ts";
import { serveDirectory } from "./static-server.ts";

// 每个组件样例在五种组合下截一张整表图并和基准图比对；伪语言那一张另做溢出检查和漏网文字检查。

const test = base.extend<object, { workbenchUrl: string }>({
  // 每个工作进程构建并提供一次工作台，用完关掉、删掉临时目录
  workbenchUrl: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright 要求第一个参数是解构，不依赖任何夹具
    async ({}, use) => {
      const dir = mkdtempSync(join(tmpdir(), "runyard-ui-visual-"));
      await buildWorkbench(dir);
      const server = await serveDirectory(dir);
      await use(server.url);
      await server.stop();
      rmSync(dir, { recursive: true, force: true }); // delete-allow: 本进程刚建的临时构建目录
    },
    { scope: "worker" },
  ],
});

const components = listComponents(join(import.meta.dirname, "../src"));

for (const component of components) {
  for (const combination of combinations) {
    test(`${component} ${combination.theme} ${combination.locale}`, async ({
      page,
      workbenchUrl,
    }) => {
      test
        .info()
        .annotations.push(
          { type: "component", description: component },
          { type: "combination", description: combinationLabel(combination) },
        );
      const query = new URLSearchParams({
        component,
        theme: combination.theme,
        locale: combination.locale,
      });
      await page.emulateMedia({ colorScheme: combination.theme });
      await page.goto(`${workbenchUrl}?${query.toString()}`);
      await expect(page.locator("[data-sample]").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      if (combination.locale === pseudoLocale) {
        // 漏网文字：collectPageTexts 在页面里收集，findLeakedText 在这里判定（合起来就是 scanPageForLeaks，
        // 因为那个函数要的是整棵 DOM，没法跨进程传）
        const texts = await page.evaluate(`(${collectPageTexts.toString()})(document.body)`);
        const leaks = findLeakedText(texts as Parameters<typeof findLeakedText>[0]);
        expect(leaks, "伪语言下有没走文案包的文字").toEqual([]);
        const overflows = await page.evaluate(
          `(${findOverflows.toString()})(document.querySelector("main"))`,
        );
        expect(overflows, "伪语言下有元素的内容撑破了自己的宽度").toEqual([]);
      }

      await expect(page.locator("main")).toHaveScreenshot(snapshotName(component, combination));
    });
  }
}

// 技术设计 §13 的风险：macos-26 上中文必须用苹方渲染。runner 上报的名字是“蘋方-簡”，本机是“PingFang SC”，
// 所以不写死名字，认这三种写法
test("中文用苹方渲染", async ({ page, workbenchUrl }) => {
  await page.goto(`${workbenchUrl}?locale=zh-CN`);
  await page.evaluate(() => document.fonts.ready);
  const client = await page.context().newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  const { root } = await client.send("DOM.getDocument");
  const { nodeId } = await client.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: "h1",
  });
  const { fonts } = await client.send("CSS.getPlatformFontsForNode", { nodeId });
  const names = fonts.map((font) => font.familyName);
  test.info().annotations.push({ type: "fonts", description: names.join(", ") });
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((name) => /PingFang|蘋方|苹方/.test(name))).toBe(true);
});
