import { describe, expect, it } from "vitest";
import { adrIndex } from "./adr-index.ts";
import { makeRepo } from "./test-helpers.ts";

const DIR = "docs/architecture/decisions";
const adr = (number: string, status = "已接受") =>
  `# ${number}. 标题\n\n状态：${status}\n\n日期：2026-10-12\n\n来源：技术设计 §3\n\n## 背景\n\nx\n\n## 决定\n\nx\n\n## 后果\n\nx\n\n## 被否的方案\n\nx\n`;

describe("adr-index 检查", () => {
  it("编号连续、格式齐全时通过", () => {
    const root = makeRepo({
      [`${DIR}/0001-first.md`]: adr("0001", "已被 0002 取代"),
      [`${DIR}/0002-second.md`]: adr("0002"),
    });
    expect(adrIndex.run(root)).toEqual([]);
  });

  it("编号跳号", () => {
    const root = makeRepo({ [`${DIR}/0001-a.md`]: adr("0001"), [`${DIR}/0003-c.md`]: adr("0003") });
    expect(adrIndex.run(root).join()).toContain("编号不连续");
  });

  it("文件名不合规则", () => {
    const root = makeRepo({ [`${DIR}/1-Monorepo.md`]: adr("0001") });
    expect(adrIndex.run(root).join()).toContain("文件名不合规则");
  });

  it("状态不合法、取代的记录不存在", () => {
    const bad = makeRepo({ [`${DIR}/0001-a.md`]: adr("0001", "Accepted") });
    expect(adrIndex.run(bad).join()).toContain("一行不合法");
    const gone = makeRepo({ [`${DIR}/0001-a.md`]: adr("0001", "已被 0009 取代") });
    expect(adrIndex.run(gone).join()).toContain("没有编号 0009 的记录");
  });

  it("缺来源、缺章节、第一行编号对不上", () => {
    const text = adr("0002").replace("来源：技术设计 §3\n", "").replace("## 后果", "## 影响");
    const errors = adrIndex.run(makeRepo({ [`${DIR}/0001-a.md`]: text })).join();
    expect(errors).toContain("缺 “来源：” 一行");
    expect(errors).toContain("章节不对");
    expect(errors).toContain("第一行必须是 “# 0001. 标题”");
  });
});
