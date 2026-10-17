import { describe, expect, it } from "vitest";
import { judgeEditorSmoke } from "./editor-smoke.ts";

const healthy = {
  done: true,
  violations: [],
  check: { tsWorkerSyntaxErrors: 1, vueTokenKinds: 5, editorRendered: true },
};

describe("judgeEditorSmoke", () => {
  it("三项自检都通过且没有策略违反时没有问题", () => {
    expect(judgeEditorSmoke(healthy, [])).toEqual([]);
  });

  it("页面事件或控制台里有一条违反内容安全策略就不通过", () => {
    expect(judgeEditorSmoke({ ...healthy, violations: ["style-src inline"] }, [])).toHaveLength(1);
    expect(judgeEditorSmoke(healthy, ["Refused to load the font"])).toHaveLength(1);
  });

  it("后台线程没报错、Shiki 单色、编辑器没画出行，各算一个问题", () => {
    const broken = { tsWorkerSyntaxErrors: 0, vueTokenKinds: 1, editorRendered: false };
    expect(judgeEditorSmoke({ ...healthy, check: broken }, [])).toHaveLength(3);
  });

  it("页面报错时带出原因，没有结果也不通过", () => {
    expect(judgeEditorSmoke({ done: true, violations: [], error: "boom" }, [])).toEqual([
      "page error: boom",
    ]);
    expect(judgeEditorSmoke({ done: true, violations: [] }, [])).toEqual(["no self-check result"]);
  });
});
