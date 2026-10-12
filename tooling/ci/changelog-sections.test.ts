import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TYPES } from "./check-title.ts";

// release-please 的更新日志章节（release-please-config.json）必须和标题检查允许的 type 一一对应：
// 允许却没有章节的 type，它的提交会被 release-please 静默丢掉（默认隐藏 chore、docs、ci、test、refactor 等）；
// 有章节却不允许的 type，章节永远是空的。负责人要求这个阶段完整记录工程工作（决策记录 0015），所以一个都不许隐藏。
const root = join(import.meta.dirname, "..", "..");
const config = JSON.parse(readFileSync(join(root, "release-please-config.json"), "utf8")) as {
  packages: Record<
    string,
    { "changelog-sections": { type: string; section: string; hidden?: boolean }[] }
  >;
};
const sections = config.packages["."]?.["changelog-sections"] ?? [];

describe("更新日志章节与标题检查的 type", () => {
  it("每个允许的 type 都有章节", () => {
    const configured = new Set(sections.map((s) => s.type));
    const missing = TYPES.filter((type) => !configured.has(type));
    expect(missing, `release-please-config.json 缺这些 type 的章节：${missing.join("、")}`).toEqual(
      [],
    );
  });

  it("每个章节的 type 都是允许的", () => {
    const allowed = new Set<string>(TYPES);
    const extra = sections.filter((s) => !allowed.has(s.type)).map((s) => s.type);
    expect(extra, `这些章节的 type 标题检查不允许：${extra.join("、")}`).toEqual([]);
  });

  it("没有重复的 type，没有隐藏的章节，章节名不为空", () => {
    expect(new Set(sections.map((s) => s.type)).size).toBe(sections.length);
    expect(sections.filter((s) => s.hidden === true)).toEqual([]);
    expect(sections.filter((s) => s.section.trim() === "")).toEqual([]);
  });

  it("章节名是中文（含汉字）", () => {
    for (const s of sections) expect(s.section).toMatch(/\p{Script=Han}/u);
  });
});
