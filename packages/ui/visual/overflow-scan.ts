// 伪语言下的溢出检查（技术设计 §6.8 伪语言规则①）：页面上任何元素的内容宽度超过自己的可见宽度，
// 而它又不是故意截断的（元素上标 data-truncate），就是版面撑破了。
// 和 pseudo-scan 同样的写法：只用节点的几个标准成员，函数自带全部辅助，所以既能交给浏览器里执行，
// 也能在测试里用假节点树跑。

export interface OverflowNodeLike {
  readonly nodeName: string;
  readonly children: ArrayLike<OverflowNodeLike>;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  hasAttribute(name: string): boolean;
}

export interface OverflowFinding {
  /** 从根往下的标签路径 */
  where: string;
  scrollWidth: number;
  clientWidth: number;
}

export function findOverflows(root: OverflowNodeLike): OverflowFinding[] {
  // 允许的误差（像素）：子像素取整会让两个数差 1。写在函数里，函数才能整个交给浏览器执行
  const TOLERANCE = 1;
  const found: OverflowFinding[] = [];
  const walk = (node: OverflowNodeLike, path: string) => {
    const here = `${path === "" ? "" : `${path} > `}${node.nodeName.toLowerCase()}`;
    // 行内元素的 clientWidth 是 0，量不出来，它的内容由外面的块元素负责
    const measurable = node.clientWidth > 0;
    if (
      measurable &&
      !node.hasAttribute("data-truncate") &&
      node.scrollWidth > node.clientWidth + TOLERANCE
    ) {
      found.push({ where: here, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth });
    }
    for (let index = 0; index < node.children.length; index += 1) {
      walk(node.children[index] as OverflowNodeLike, here);
    }
  };
  walk(root, "");
  return found;
}
