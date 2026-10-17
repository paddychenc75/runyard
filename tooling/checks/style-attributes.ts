import { lineOf, ts, visit } from "./ts-source.ts";

// tsx 里 style={{…}} 的检查（style-tokens 的一部分）：颜色和尺寸不许写死。
// 组件本来就不收 style 属性（样式入口只有 className，技术设计 §6.7 组件的属性约定 5），
// 能写 style 的只有内部元素；写了就必须是 var(--…)，或 0。

const SIZE_PROPERTIES =
  /^(?:width|height|minWidth|maxWidth|minHeight|maxHeight|top|bottom|gap|rowGap|columnGap|fontSize|borderRadius|zIndex|lineHeight|letterSpacing|margin\w*|padding\w*|inset\w*|border\w*Width|boxShadow|font|fontFamily|transition\w*|animation\w*)$/;
const COLOR_PROPERTIES =
  /^(?:color|background\w*|border\w*Color|outline\w*|fill|stroke|caretColor|accentColor)$/;
const PHYSICAL_PROPERTIES =
  /^(?:left|right|margin(?:Left|Right)|padding(?:Left|Right)|border(?:Left|Right)\w*)$/;
const PLAIN_COLOR_OK = /^(?:transparent|currentColor|inherit|initial|unset|none)$/i;

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

export function checkStyleAttributes(
  path: string,
  file: ts.SourceFile,
  fix: (what: string) => string,
): string[] {
  const errors: string[] = [];
  visit(file, (node) => {
    if (!ts.isJsxAttribute(node) || node.name.getText(file) !== "style") return;
    visit(node, (inner) => {
      if (!ts.isPropertyAssignment(inner)) return;
      const name = propertyName(inner.name);
      if (name === undefined) return;
      const line = lineOf(file, inner.getStart(file));
      const value = inner.initializer;
      const literal = ts.isStringLiteralLike(value) ? value.text : undefined;
      const hasVar = literal?.includes("var(") ?? false;
      let problem: string | undefined;
      if (PHYSICAL_PROPERTIES.test(name)) {
        problem = `用了左右方向的 ${name}，改成逻辑方向（marginInlineStart、insetInlineEnd 一类）`;
      } else if (
        COLOR_PROPERTIES.test(name) &&
        !hasVar &&
        !(literal !== undefined && PLAIN_COLOR_OK.test(literal))
      ) {
        problem = `${name} 写死了颜色`;
      } else if (SIZE_PROPERTIES.test(name) && !hasVar) {
        const numeric = ts.isNumericLiteral(value) ? Number(value.text) : undefined;
        if (numeric !== undefined && numeric !== 0) {
          problem = `${name} 写死了数值 ${numeric}`;
        } else if (
          literal !== undefined &&
          !/^(?:0|auto|inherit|initial|unset|none|normal)$/.test(literal.trim())
        ) {
          problem = `${name} 写死了“${literal}”`;
        }
      }
      if (problem !== undefined)
        errors.push(
          `${path}:${line} 的 style 里${problem}。${fix("style 里的颜色和尺寸不能写死")}`,
        );
    });
  });
  return errors;
}
