import type { Page } from "@playwright/test";
import { collectPageTexts, findLeakedText, type PageText } from "@runyard/i18n";
import { findOverflows } from "../../../packages/ui/visual/overflow-scan.ts";
import { expect } from "./fixtures.ts";

export async function auditScreen(page: Page): Promise<void> {
  const texts = (await page.evaluate(
    `(${collectPageTexts.toString()})(document.body)`,
  )) as PageText[];
  expect(findLeakedText(texts), "画面存在未通过文案包的文字").toEqual([]);
  expect(
    await page.evaluate(`(${findOverflows.toString()})(document.body)`),
    "画面内容溢出",
  ).toEqual([]);
}
