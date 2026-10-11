import { describe, expect, it } from "vitest";
import { readmeSync } from "./readme-sync.ts";
import { makeRepo } from "./test-helpers.ts";

const EN_HEAD = "# Runyard\n\nEnglish | [简体中文](README.zh-CN.md)\n\n";
const ZH_HEAD = "# Runyard\n\n[English](README.md) | 简体中文\n\n";
const section = (id: string, title: string) => `<!-- sec: ${id} -->\n## ${title}\n\n正文\n\n`;

describe("readme-sync 检查", () => {
  it("标记序列一致、互相链接时通过（标题文字可以不同）", () => {
    const root = makeRepo({
      "README.md": EN_HEAD + section("status", "Status") + section("license", "License"),
      "README.zh-CN.md": ZH_HEAD + section("status", "状态") + section("license", "许可"),
    });
    expect(readmeSync.run(root)).toEqual([]);
  });

  it("只有一个 README 多了一节", () => {
    const root = makeRepo({
      "README.md": EN_HEAD + section("status", "Status") + section("install", "Install"),
      "README.zh-CN.md": ZH_HEAD + section("status", "状态"),
    });
    expect(readmeSync.run(root).join()).toContain("章节不一致");
  });

  it("标题上一行没有标记", () => {
    const root = makeRepo({
      "README.md": `${EN_HEAD}## Status\n`,
      "README.zh-CN.md": ZH_HEAD + section("status", "状态"),
    });
    expect(readmeSync.run(root).join()).toContain("上一行没有章节标记");
  });

  it("开头缺少指向对方的链接；缺一个文件", () => {
    const root = makeRepo({
      "README.md": `# Runyard\n\n${section("status", "Status")}`,
      "README.zh-CN.md": ZH_HEAD + section("status", "状态"),
    });
    expect(readmeSync.run(root).join()).toContain("开头缺少指向 README.zh-CN.md 的链接");
    expect(readmeSync.run(makeRepo({ "README.md": EN_HEAD })).join()).toContain(
      "缺少 README.zh-CN.md",
    );
  });
});
