import { describe, expect, it } from "vitest";
import { fuzzyMatch, highlightParts } from "./fuzzy.ts";

describe("fuzzyMatch", () => {
  it("[DESKTOP-EDITOR-69] 字符按顺序出现就匹配，不分大小写；顺序不对不匹配", () => {
    expect(fuzzyMatch("sapp", "src/App.tsx")?.positions).toEqual([0, 4, 5, 6]);
    expect(fuzzyMatch("pas", "src/App.tsx")).toBeNull();
    expect(fuzzyMatch("APP", "src/app.css")).not.toBeNull();
  });

  it("[DESKTOP-EDITOR-69] 连续命中词首的比散落各处的分数高", () => {
    const tight = fuzzyMatch("app", "App.tsx");
    const loose = fuzzyMatch("app", "a-big-playground-project.ts");
    expect(tight?.score ?? 0).toBeGreaterThan(loose?.score ?? 0);
  });

  it("[DESKTOP-EDITOR-58] 英文名里的高亮落在命中的字母上", () => {
    const match = fuzzyMatch("stop", "Stop All");
    expect(match?.positions).toEqual([0, 1, 2, 3]);
    expect(highlightParts("Stop All", match?.positions ?? [])).toEqual([
      { text: "Stop", hit: true, start: 0 },
      { text: " All", hit: false, start: 4 },
    ]);
  });

  it("空查询匹配一切且没有高亮", () => {
    expect(fuzzyMatch("  ", "x")).toEqual({ score: 0, positions: [] });
  });
});
