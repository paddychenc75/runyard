import { describe, expect, it } from "vitest";
import {
  collectPageTexts,
  findLeakedText,
  type PageNodeLike,
  scanPageForLeaks,
} from "./pseudo-scan.ts";

// 假节点树：只实现扫描用到的那几个成员
function el(
  name: string,
  attrs: Record<string, string>,
  ...children: PageNodeLike[]
): PageNodeLike {
  return {
    nodeType: 1,
    nodeValue: null,
    nodeName: name,
    childNodes: children,
    getAttribute: (key) => attrs[key] ?? null,
    hasAttribute: (key) => key in attrs,
  };
}
const text = (value: string): PageNodeLike => ({ nodeType: 3, nodeValue: value, childNodes: [] });

describe("伪语言下扫页面（第 5 层）", () => {
  it("整句在 ⟦ ⟧ 里的文字放行，没包的含字母文字报出来", () => {
    const leaks = findLeakedText([
      { text: "⟦Ŕúñ~⟧", where: "button" },
      { text: "Run", where: "p" },
      { text: "还没有项目", where: "p" },
      { text: "12 / 30", where: "span" },
      { text: "⟦Ŕúñ⟧ Stop", where: "div" },
    ]);
    expect(leaks.map((leak) => leak.text)).toEqual(["Run", "还没有项目", "⟦Ŕúñ⟧ Stop"]);
  });

  it("收集文字节点和 aria-label、title、placeholder，位置是标签路径", () => {
    const root = el(
      "DIV",
      {},
      el("BUTTON", { "aria-label": "Close", title: "⟦Ćļóšé⟧" }, text("⟦Ŕúñ⟧")),
      el("INPUT", { placeholder: "Search" }),
      el("SCRIPT", {}, text("var a = 'x'")),
    );
    expect(collectPageTexts(root)).toEqual([
      { text: "Close", where: "div > button[aria-label]" },
      { text: "⟦Ćļóšé⟧", where: "div > button[title]" },
      { text: "⟦Ŕúñ⟧", where: "div > button" },
      { text: "Search", where: "div > input[placeholder]" },
    ]);
  });

  it("data-user-content 和 data-i18n-skip 整棵子树跳过", () => {
    const root = el(
      "DIV",
      {},
      el("SPAN", { "data-user-content": "" }, text("my-playground")),
      el("DIV", { "data-i18n-skip": "第三方控件" }, el("P", {}, text("Third party"))),
      el("P", {}, text("Leaked")),
    );
    expect(scanPageForLeaks(root)).toEqual([{ text: "Leaked", where: "div > p" }]);
  });
});
