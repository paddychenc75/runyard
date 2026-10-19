import { readText } from "./docs.ts";
import { listProductSources } from "./source-files.ts";
import { lineOf, parseSource, ts, visit } from "./ts-source.ts";
import type { Check } from "./workspace.ts";

// button-groups：并排的按钮必须同一档高度，主次只靠颜色分（issue #419，视觉规范“按钮”一节）。
// 档位由 ButtonGroup 一处定，所以查两样：
// 1. 同一个父元素下有两个以上直接相邻的 <Button>，父元素必须是 <ButtonGroup>
//    （弹窗、提示条的 actions 属性里的片段除外：组件自己会套 ButtonGroup）；
// 2. ButtonGroup 里的 <Button> 不许自己写 size（写了也不起作用，只会误导读代码的人）。
// 样例文件（*.fixture.tsx）不查：Button 的样例就是要并排摆出三档。

const GUIDE = "docs/design/visual-system.md 的“按钮”一节";

function tagName(node: ts.JsxElement | ts.JsxSelfClosingElement, file: ts.SourceFile): string {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.tagName.getText(file);
}

function attributesOf(node: ts.JsxElement | ts.JsxSelfClosingElement): ts.JsxAttributes {
  return (ts.isJsxElement(node) ? node.openingElement : node).attributes;
}

function hasSize(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  return attributesOf(node).properties.some(
    (p) => ts.isJsxAttribute(p) && p.name.getText() === "size",
  );
}

// 把一个父元素的子节点摊平：穿过片段、括号、条件表达式和 &&，只收 <Button>
function collectButtons(
  children: readonly ts.Node[],
  file: ts.SourceFile,
  out: (ts.JsxElement | ts.JsxSelfClosingElement)[],
): void {
  for (const child of children) {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
      if (tagName(child, file) === "Button") out.push(child);
    } else if (ts.isJsxFragment(child)) {
      collectButtons(child.children, file, out);
    } else if (ts.isJsxExpression(child) && child.expression !== undefined) {
      collectButtons([child.expression], file, out);
    } else if (ts.isParenthesizedExpression(child)) {
      collectButtons([child.expression], file, out);
    } else if (ts.isConditionalExpression(child)) {
      // 两个分支只会出现一个，取按钮多的那条
      const whenTrue: (ts.JsxElement | ts.JsxSelfClosingElement)[] = [];
      const whenFalse: (ts.JsxElement | ts.JsxSelfClosingElement)[] = [];
      collectButtons([child.whenTrue], file, whenTrue);
      collectButtons([child.whenFalse], file, whenFalse);
      out.push(...(whenTrue.length >= whenFalse.length ? whenTrue : whenFalse));
    } else if (ts.isBinaryExpression(child)) {
      collectButtons([child.right], file, out);
    }
  }
}

// 片段、括号、条件、&& 都是透明的：往上找到真正装着它的元素
function enclosingElement(node: ts.Node, file: ts.SourceFile): string | undefined {
  let current: ts.Node = node.parent;
  while (current !== undefined) {
    if (ts.isJsxElement(current)) return tagName(current, file);
    if (ts.isJsxAttribute(current) || ts.isSourceFile(current)) return undefined;
    current = current.parent;
  }
  return undefined;
}

function isActionsSlot(fragment: ts.JsxFragment): boolean {
  const expression = fragment.parent;
  return (
    ts.isJsxExpression(expression) &&
    ts.isJsxAttribute(expression.parent) &&
    expression.parent.name.getText() === "actions"
  );
}

export function checkButtonGroups(path: string, text: string): string[] {
  const file = parseSource(path, text);
  const errors: string[] = [];
  visit(file, (node) => {
    let owner: "group" | "slot" | "other";
    let children: readonly ts.Node[];
    if (ts.isJsxElement(node)) {
      owner = tagName(node, file) === "ButtonGroup" ? "group" : "other";
      children = node.children;
    } else if (ts.isJsxFragment(node)) {
      // 嵌在别的元素里的片段由那个元素统一检查；只有 actions 槽里的片段和孤立的片段自己查
      if (!isActionsSlot(node) && enclosingElement(node, file) !== undefined) return;
      owner = isActionsSlot(node) ? "slot" : "other";
      children = node.children;
    } else {
      return;
    }
    const buttons: (ts.JsxElement | ts.JsxSelfClosingElement)[] = [];
    collectButtons(children, file, buttons);
    if (owner === "other" && buttons.length >= 2) {
      errors.push(
        `${path}:${lineOf(file, node.getStart(file))} 有 ${buttons.length} 个并排的 <Button> 没有放进 <ButtonGroup>。用 <ButtonGroup size="…"> 包起来，整组同一档高度，见 ${GUIDE}。`,
      );
    }
    if (owner !== "other") {
      for (const button of buttons) {
        if (hasSize(button)) {
          errors.push(
            `${path}:${lineOf(file, button.getStart(file))} 组里的 <Button> 不许自己写 size。删掉它，档位写在 <ButtonGroup size="…"> 上，见 ${GUIDE}。`,
          );
        }
      }
    }
  });
  return errors;
}

export const buttonGroups: Check = {
  name: "button-groups",
  run(root) {
    const errors: string[] = [];
    for (const path of listProductSources(root)) {
      if (!path.endsWith(".tsx") || path.endsWith(".fixture.tsx")) continue;
      errors.push(...checkButtonGroups(path, readText(root, path)));
    }
    return errors;
  },
};
