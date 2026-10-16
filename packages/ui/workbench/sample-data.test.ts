import { findLeakedText, PSEUDO_CLOSE, PSEUDO_OPEN } from "@runyard/i18n";
import { describe, expect, it } from "vitest";
import { workbenchData } from "./sample-data.ts";

describe("工作台的示例文字", () => {
  it("伪语言下每一段文字（样例和工作台自己的界面）都包在 ⟦ ⟧ 里，漏网扫描找不到字母", () => {
    const data = workbenchData("en-XA");
    const texts = [...Object.values(data.sample), ...Object.values(data.chrome)];
    for (const text of texts) {
      expect(text.startsWith(PSEUDO_OPEN) && text.endsWith(PSEUDO_CLOSE), text).toBe(true);
    }
    expect(findLeakedText(texts.map((text) => ({ text, where: "x" })))).toEqual([]);
  });

  it("伪语言比英文长约 40%，用来撑出版面溢出", () => {
    const pseudo = workbenchData("en-XA").sample.longLabel;
    const english = workbenchData("en").sample.longLabel;
    expect(pseudo.length).toBeGreaterThan(english.length * 1.3);
  });
});
