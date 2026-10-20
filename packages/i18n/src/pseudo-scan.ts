import { PSEUDO_CLOSE, PSEUDO_OPEN } from "./pseudo.ts";

// 第 5 层：伪语言下扫真实页面（技术设计 §6.8）。页面上每个可见文字节点和每个 aria-label、title、
// placeholder，含字母（或汉字）却不在一对 ⟦ ⟧ 里，就是没走文案包的文字。
// 用户自己的内容（项目名、代码、日志、路径）用 UserText 显示，元素上带 data-user-content，整棵子树跳过；
// 个别第三方控件误报时元素上标 data-i18n-skip 并写理由，次数由 skips 检查统计。
// 这里只放不依赖浏览器的部分：collectPageTexts 只用节点的几个标准属性，所以既能在真实页面里
// 通过 page.evaluate 跑（函数自带全部辅助，不引用外部变量），也能在测试里用假节点树跑。

export interface PageText {
  text: string;
  /** 文字出现的位置：从根往下的标签路径，属性的写成 `button[aria-label]` */
  where: string;
}

/** DOM 节点里这个扫描用到的那几个成员 */
export interface PageNodeLike {
  readonly nodeType: number;
  readonly nodeValue: string | null;
  readonly childNodes: ArrayLike<PageNodeLike>;
  readonly nodeName?: string;
  getAttribute?(name: string): string | null;
  hasAttribute?(name: string): boolean;
}

const LETTER = /[\p{L}]/u;

/** 翻译参数也可能是翻译结果；只移除完整配对区间，不能遇到内层闭括号就结束。 */
function outsidePseudo(value: string): string {
  let depth = 0;
  let pending = "";
  let outside = "";
  for (const character of value) {
    if (character === PSEUDO_OPEN) {
      depth += 1;
      pending += character;
    } else if (depth > 0) {
      pending += character;
      if (character === PSEUDO_CLOSE) {
        depth -= 1;
        if (depth === 0) pending = "";
      }
    } else outside += character;
  }
  // 未闭合的片段仍要检查，不能用一个开括号让后面的裸文案消失。
  return outside + pending;
}

/** 去掉所有完整的 ⟦…⟧ 之后还剩字母的文字，就是漏网的。每个样本独立配对。 */
export function findLeakedText(samples: readonly PageText[]): PageText[] {
  return samples.filter((sample) => LETTER.test(outsidePseudo(sample.text)));
}

/** 收集可见文字：文字节点加三个属性。自带全部辅助，可以直接交给 page.evaluate。 */
export function collectPageTexts(root: PageNodeLike): PageText[] {
  const ELEMENT = 1;
  const TEXT = 3;
  const SKIPPED_TAGS = ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"];
  const ATTRIBUTES = ["aria-label", "title", "placeholder"];
  const found: PageText[] = [];
  const walk = (node: PageNodeLike, path: string) => {
    if (node.nodeType === TEXT) {
      const text = (node.nodeValue ?? "").trim();
      if (text !== "") found.push({ text, where: path });
      return;
    }
    if (node.nodeType !== ELEMENT) return;
    const name = (node.nodeName ?? "").toUpperCase();
    if (SKIPPED_TAGS.includes(name)) return;
    if (node.hasAttribute?.("data-user-content") || node.hasAttribute?.("data-i18n-skip")) return;
    const here = path === "" ? name.toLowerCase() : `${path} > ${name.toLowerCase()}`;
    for (const attribute of ATTRIBUTES) {
      const value = node.getAttribute?.(attribute)?.trim();
      if (value) found.push({ text: value, where: `${here}[${attribute}]` });
    }
    // 富文案可在同一父节点内被UserText分开：只把直接文字与这种透明插值视为一个连续片段。
    // 普通子元素、显式跳过的第三方区域和父边界都切断片段；不能按相同标签路径跨元素配对。
    let run = "";
    const flush = () => {
      if (run.trim() !== "") found.push({ text: run.trim(), where: here });
      run = "";
    };
    for (let index = 0; index < node.childNodes.length; index += 1) {
      const child = node.childNodes[index] as PageNodeLike;
      if (child.nodeType === TEXT) run += child.nodeValue ?? "";
      else if (child.hasAttribute?.("data-user-content")) continue;
      else {
        flush();
        walk(child, here);
      }
    }
    flush();
  };
  walk(root, "");
  return found;
}

/** 收集加判断：返回漏网的文字和它们的位置 */
export function scanPageForLeaks(root: PageNodeLike): PageText[] {
  return findLeakedText(collectPageTexts(root));
}
