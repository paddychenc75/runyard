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
  it("嵌套翻译参数按平衡括号识别，外部裸文案和未配对片段仍报告", () => {
    const nested = "⟦⟦Ƒíñíšĥéð⟧ · éẋíţ çóðé 0 · ⟦0.15 š⟧⟧";
    const samples = [
      nested,
      `${nested} Raw`,
      `Raw ${nested}`,
      "⟦Unclosed ⟦Ŕúñ⟧",
      "Raw⟧",
      "⟦Ŕúñ⟧ Raw ⟦Šţóþ⟧",
    ].map((value) => ({ text: value, where: "span" }));
    expect(findLeakedText(samples)).toEqual(samples.slice(1));
    expect(
      findLeakedText([
        { text: "⟦Raw", where: "p" },
        { text: "Other⟧", where: "p" },
      ]),
    ).toHaveLength(2);
  });

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

it("同一富文案跨直接UserText的分片仍是一句，括号外的裸英文照常报告", () => {
  const sentence = el(
    "P",
    {},
    text("⟦Ƒóļðéŕ: "),
    el("SPAN", { "data-user-content": "" }, text("~/Runyard/demo")),
    text(" íš ɱíššíñĝ⟧"),
  );
  expect(scanPageForLeaks(sentence)).toEqual([]);
  const withLeak = el("P", {}, ...Array.from(sentence.childNodes), text(" Untranslated"));
  expect(scanPageForLeaks(withLeak).map((item) => item.text)).toEqual([
    "⟦Ƒóļðéŕ:  íš ɱíššíñĝ⟧ Untranslated",
  ]);
});

it("不同元素的括号不能跨边界包住相邻裸英文，属性也独立检查", () => {
  const root = el(
    "DIV",
    {},
    el("P", {}, text("⟦Ŕúñ")),
    el("P", {}, text("Untranslated")),
    el("P", {}, text("éñð⟧")),
    el(
      "P",
      {},
      el("SPAN", {}, text("⟦Ŕúñ⟧")),
      text(" Raw sibling "),
      el("SPAN", {}, text("⟦Šţóþ⟧")),
    ),
    el(
      "P",
      { title: "Plain title" },
      text("⟦Ƒóļðéŕ "),
      el("SPAN", { "data-user-content": "" }, text("path")),
      text("éñð⟧"),
    ),
  );
  const leaks = scanPageForLeaks(root).map((item) => item.text);
  expect(leaks).toContain("Untranslated");
  expect(leaks).toContain("Raw sibling");
  expect(leaks).toContain("Plain title");
});

it("UserText里的伪括号不替外部裸文案配对，普通子元素属性仍被检查", () => {
  const root = el(
    "P",
    {},
    el("SPAN", { "data-user-content": "" }, text("⟦")),
    text("Raw"),
    el("SPAN", { "data-user-content": "" }, text("⟧")),
    el("BUTTON", { "aria-label": "Raw aria", title: "Raw title" }, text("⟦Ŕúñ⟧")),
    el("INPUT", { placeholder: "Raw placeholder" }),
  );
  expect(scanPageForLeaks(root).map((item) => item.text)).toEqual([
    "Raw",
    "Raw aria",
    "Raw title",
    "Raw placeholder",
  ]);
});
