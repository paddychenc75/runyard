import { describe, expect, it } from "vitest";
import { findOverflows, type OverflowNodeLike } from "./overflow-scan.ts";

function node(
  name: string,
  box: { scrollWidth: number; clientWidth: number },
  children: OverflowNodeLike[] = [],
  attributes: string[] = [],
): OverflowNodeLike {
  return {
    nodeName: name.toUpperCase(),
    children,
    ...box,
    hasAttribute: (n) => attributes.includes(n),
  };
}

describe("伪语言下的溢出检查", () => {
  it("内容宽度超过可见宽度的元素被报出来，带从根往下的路径", () => {
    const page = node("main", { scrollWidth: 300, clientWidth: 300 }, [
      node("div", { scrollWidth: 300, clientWidth: 300 }, [
        node("button", { scrollWidth: 180, clientWidth: 120 }),
      ]),
    ]);
    expect(findOverflows(page)).toEqual([
      { where: "main > div > button", scrollWidth: 180, clientWidth: 120 },
    ]);
  });

  it("标了 data-truncate 的元素是故意截断的，不报", () => {
    const page = node("main", { scrollWidth: 300, clientWidth: 300 }, [
      node("span", { scrollWidth: 500, clientWidth: 100 }, [], ["data-truncate"]),
    ]);
    expect(findOverflows(page)).toEqual([]);
  });

  it("差 1 像素以内是取整误差，行内元素（宽度量不出来）不报", () => {
    const page = node("main", { scrollWidth: 301, clientWidth: 300 }, [
      node("span", { scrollWidth: 90, clientWidth: 0 }),
    ]);
    expect(findOverflows(page)).toEqual([]);
  });
});
