import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CSS_COLOR_NAMES } from "./css-colors.ts";
import { type CssDeclaration, splitCss } from "./css-declarations.ts";
import { listFiles, readText } from "./docs.ts";
import { checkStyleAttributes } from "./style-attributes.ts";
import { lineOf, parseSource, ts, visit } from "./ts-source.ts";
import type { Check } from "./workspace.ts";

// style-tokens：样式只用设计变量（技术设计 §3.3、§6.7 规则 3、7、6）。逐行正则，不引入 CSS 解析库。
// 拦住：
// 1. 十六进制颜色、rgb()/hsl() 等颜色函数、颜色关键字（red）；
// 2. 不在白名单（0、1px）里的像素值；
// 3. 直接写数值的 border-radius、font-size、font-family、font、z-index、box-shadow；
// 4. materials.css 之外的 backdrop-filter；
// 5. 四处之外的 [data-platform] 选择器；
// 6. 基础级变量（--blue-600 一类，名单读自 packages/tokens/generated/tokens.css）；
// 7. 左右方向的属性（要写逻辑方向）；
// 8. tsx 里 style={{…}} 的颜色和尺寸（style-attributes.ts），以及 tsx 字符串里的颜色和 backdrop-filter；
// 9. 写死的动画时长（transition、animation 里的 120ms、0.2s，视觉规范第 6 节，只许 var(--motion-duration-*)）；
// 10. 浏览器自带滚动条的样式（::-webkit-scrollbar、scrollbar-width、scrollbar-color）和 overflow: auto|scroll：
//     滚动区域一律用 @runyard/ui 的 ScrollArea（视觉规范第 5 节，#311），只有 ScrollArea 自己的目录可以写。
// 范围：packages/ui/ 下除测试外的 .css 和 .tsx；apps/desktop/src/renderer/ 下除测试外的 .module.css 和 .tsx
//（技术设计 §6.7 写的是“*.module.css 和 *.tsx”；全局样式文件只在 packages/ui 里有，那里全查），
// 另外 renderer 里任何 .css 也查第 4、5 条。packages/tokens/generated/ 豁免（生成物，不在上述范围里）。

const UI_ROOT = "packages/ui/";
const RENDERER_ROOT = "apps/desktop/src/renderer/";
const SCROLL_AREA = "packages/ui/src/primitives/ScrollArea/";
// 组件工作台是开发用的静态页，不是应用界面，里面的 overflow 不算
const SCROLL_EXEMPT = ["packages/ui/workbench/"];
const MATERIALS = "packages/ui/src/styles/materials.css";
const TOKENS_CSS = "packages/tokens/generated/tokens.css";
const SEMANTIC_PREFIXES = new Set([
  "color",
  "glass",
  "shadow",
  "radius",
  "space",
  "size",
  "font",
  "text",
  "motion",
  "z",
]);
// 允许出现 [data-platform] 的四处里属于界面一侧的三处（第四处是 tokens.json 和文案，不是样式文件）
const PLATFORM_ALLOWED = [
  "packages/ui/src/platform/",
  "packages/ui/src/primitives/TitleBar/",
  "packages/ui/src/primitives/ScrollArea/",
  "packages/ui/src/primitives/Kbd/",
  "packages/ui/src/patterns/TitleBar/",
  "packages/ui/src/patterns/ScrollArea/",
  "packages/ui/src/patterns/Kbd/",
];

const COLOR_PROPERTY = /color|^background|^border|^outline|shadow|^fill$|^stroke$|^text-decoration/;
const PLAIN_OK = new Set(["0", "none", "inherit", "initial", "unset", "revert", "auto"]);
const DIRECT_VALUE_PROPERTY = /^(?:font|font-size|font-family|z-index|box-shadow)$|radius$/;
const PHYSICAL_PROPERTY =
  /^(?:margin|padding|scroll-margin|scroll-padding)-(?:left|right)$|^border-(?:left|right)(?:-[a-z]+)?$|^border-(?:top|bottom)-(?:left|right)-radius$|^(?:left|right)$/;
const PHYSICAL_VALUE_PROPERTY = /^(?:text-align|float|clear)$/;
const DURATION_PROPERTY = /^(?:transition(?:-duration|-delay)?|animation(?:-duration|-delay)?)$/;
const NATIVE_SCROLLBAR_PROPERTY = /^scrollbar-(?:width|color|gutter)$/;
const SCROLLING_OVERFLOW = /\b(?:auto|scroll|overlay)\b/i;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const HEX_COLOR = /(?<![\w&-])#[0-9a-fA-F]{3,8}\b/;

const fix = (what: string) =>
  `${what}。样式只用设计变量：用 var(--…) 语义变量，缺变量就先改 packages/tokens/src/tokens.json 再运行 pnpm tokens:build；见 docs/guides/add-ui-component.md 的“样式只用语义变量”和技术设计 §6.7 规则 3。`;

function baseLevelVariables(root: string): Set<string> {
  const path = join(root, TOKENS_CSS);
  if (!existsSync(path)) return new Set();
  const names = new Set<string>();
  for (const match of readFileSync(path, "utf8").matchAll(/^\s*(--([a-z]+)-[\w-]+)\s*:/gm)) {
    if (!SEMANTIC_PREFIXES.has(match[2] as string)) names.add(match[1] as string);
  }
  return names;
}

// 去掉不该扫的部分：url(...)（里面常有 #id）和字符串
const scrub = (value: string) =>
  value.replace(/url\([^)]*\)/g, "url()").replace(/"[^"]*"|'[^']*'/g, '""');

function pixelProblems(value: string): string[] {
  const bad: string[] = [];
  for (const match of value.matchAll(/(?<![\w.#-])(\d*\.?\d+)px\b/g)) {
    const number = Number(match[1]);
    if (number !== 0 && number !== 1) bad.push(`${match[1]}px`);
  }
  return bad;
}

function colorProblem(property: string, value: string): string | undefined {
  const cleaned = scrub(value);
  const hex = HEX_COLOR.exec(cleaned);
  if (hex !== null) return hex[0];
  const fn = COLOR_FUNCTION.exec(cleaned);
  if (fn !== null) return `${fn[0]}…)`;
  if (property.startsWith("--") || COLOR_PROPERTY.test(property)) {
    const withoutVars = cleaned.replace(/var\(\s*--[\w-]+/g, "var(");
    for (const word of withoutVars.matchAll(/(?<![\w-])([a-z]+)(?![\w(-])/gi)) {
      if (CSS_COLOR_NAMES.has((word[1] as string).toLowerCase())) return word[1];
    }
  }
  return undefined;
}

export function checkCssDeclaration(
  path: string,
  decl: CssDeclaration,
  baseVars: ReadonlySet<string>,
  valueRules: boolean,
): string[] {
  const where = `${path}:${decl.line}`;
  const property = decl.property.toLowerCase();
  const errors: string[] = [];
  if (/^(?:-webkit-)?backdrop-filter$/.test(property) && path !== MATERIALS) {
    errors.push(
      `${where} 写了 ${property}，它只许出现在 packages/ui/src/styles/materials.css。组件改用 <GlassSurface material="…">，不自己写模糊；见技术设计 §6.7 规则 7。`,
    );
  }
  if (NATIVE_SCROLLBAR_PROPERTY.test(property) && !path.startsWith(SCROLL_AREA)) {
    errors.push(
      `${where} 写了 ${property}，浏览器自带的滚动条样式只许出现在 ${SCROLL_AREA}。滚动区域改用 @runyard/ui 的 <ScrollArea>；见视觉规范第 5 节。`,
    );
  }
  if (!valueRules) return errors;

  const value = scrub(decl.value);
  if (
    /^overflow(?:-[xy]|-inline|-block)?$/.test(property) &&
    SCROLLING_OVERFLOW.test(value) &&
    !path.startsWith(SCROLL_AREA) &&
    !SCROLL_EXEMPT.some((prefix) => path.startsWith(prefix))
  ) {
    errors.push(
      `${where} 写了 ${property}: ${decl.value.trim()}，会出现浏览器自带的滚动条。滚动区域改用 @runyard/ui 的 <ScrollArea>（内容的内边距用它的 viewportClassName）；见视觉规范第 5 节。`,
    );
  }
  if (DURATION_PROPERTY.test(property)) {
    const durations = [
      ...value.replace(/var\([^)]*\)/g, "").matchAll(/(?<![\w.#-])(\d*\.?\d+)(m?s)\b/g),
    ]
      .filter((match) => Number(match[1]) !== 0)
      .map((match) => `${match[1]}${match[2]}`);
    if (durations.length > 0) {
      errors.push(
        `${where} 写死了时长 ${durations.join("、")}（${property}）。${fix("时长只许 var(--motion-duration-*)，缺就先加到 tokens.json")}`,
      );
    }
  }
  const color = colorProblem(property, decl.value);
  if (color !== undefined)
    errors.push(`${where} 写死了颜色 ${color}（${property}）。${fix("颜色不能写死")}`);
  const pixels = pixelProblems(value);
  if (pixels.length > 0) {
    errors.push(
      `${where} 写死了像素值 ${pixels.join("、")}（${property}）。${fix("像素值只许 0 和 1px，其余用 --space-*、--size-* 一类的变量")}`,
    );
  }
  if (
    DIRECT_VALUE_PROPERTY.test(property) &&
    !value.includes("var(") &&
    !PLAIN_OK.has(value.trim().toLowerCase())
  ) {
    errors.push(
      `${where} 的 ${property} 直接写了数值“${decl.value}”。${fix("圆角、字号、字体、层级、阴影必须用变量")}`,
    );
  }
  if (
    PHYSICAL_PROPERTY.test(property) ||
    (PHYSICAL_VALUE_PROPERTY.test(property) && /\b(?:left|right)\b/i.test(value))
  ) {
    errors.push(
      `${where} 用了左右方向的 ${property}。改成逻辑方向（margin-inline-start、padding-inline-end、inset-inline-start、text-align: start），给从右到左的语言留路；见技术设计 §6.7 规则 3。`,
    );
  }
  for (const match of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
    if (baseVars.has(match[1] as string)) {
      errors.push(
        `${where} 用了基础级变量 ${match[1]}。组件只许用语义级变量（--color-*、--space-* 一类）；缺语义变量就在 tokens.json 里加；见技术设计 §6.7“设计变量怎么来、怎么用”。`,
      );
    }
  }
  return errors;
}

export function checkCssFile(
  path: string,
  text: string,
  baseVars: ReadonlySet<string>,
  valueRules: boolean,
): string[] {
  const { declarations, preludes } = splitCss(text);
  const errors = declarations.flatMap((decl) =>
    checkCssDeclaration(path, decl, baseVars, valueRules),
  );
  if (!path.startsWith(SCROLL_AREA)) {
    for (const prelude of preludes) {
      if (/::-webkit-scrollbar/.test(prelude.text)) {
        errors.push(
          `${path}:${prelude.line} 写了 ::-webkit-scrollbar，浏览器自带的滚动条样式只许出现在 ${SCROLL_AREA}。滚动区域改用 @runyard/ui 的 <ScrollArea>；见视觉规范第 5 节。`,
        );
      }
    }
  }
  if (!PLATFORM_ALLOWED.some((prefix) => path.startsWith(prefix))) {
    for (const prelude of preludes) {
      if (/\[\s*data-platform\b/.test(prelude.text)) {
        errors.push(
          `${path}:${prelude.line} 写了 [data-platform] 选择器，界面里只有 packages/ui/src/platform/ 和 TitleBar、ScrollArea、Kbd 三个组件可以按系统分支。把差异收进设计变量（tokens.json 的 platform 一节）或这几处；见技术设计 §6.7 规则 6 和“平台变体”。`,
        );
      }
    }
  }
  return errors;
}

export function checkTsxFile(path: string, text: string): string[] {
  const file = parseSource(path, text);
  const errors: string[] = [];
  const report = (node: ts.Node, message: string) =>
    errors.push(`${path}:${lineOf(file, node.getStart(file))} ${message}`);
  visit(file, (node) => {
    if (
      !(
        ts.isStringLiteralLike(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      )
    )
      return;
    const value = node.text;
    if (HEX_COLOR.test(value) || COLOR_FUNCTION.test(value)) {
      report(node, `的字符串里写死了颜色。${fix("颜色不能写死")}`);
    }
    if (/backdrop-filter/.test(value)) {
      report(
        node,
        '的字符串里写了 backdrop-filter，它只许出现在 packages/ui/src/styles/materials.css。组件改用 <GlassSurface material="…">；见技术设计 §6.7 规则 7。',
      );
    }
    if (
      /\[\s*data-platform\b/.test(value) &&
      !PLATFORM_ALLOWED.some((prefix) => path.startsWith(prefix))
    ) {
      report(
        node,
        "的字符串里写了 [data-platform]，界面里只有 packages/ui/src/platform/ 和 TitleBar、ScrollArea、Kbd 三个组件可以按系统分支；见技术设计 §6.7 规则 6。",
      );
    }
  });
  errors.push(...checkStyleAttributes(path, file, fix));
  return errors;
}

const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|mts)$/;

export const styleTokens: Check = {
  name: "style-tokens",
  run(root) {
    const baseVars = baseLevelVariables(root);
    const errors: string[] = [];
    for (const file of listFiles(root)) {
      const inUi = file.startsWith(UI_ROOT) && !file.includes("/node_modules/");
      const inRenderer = file.startsWith(RENDERER_ROOT);
      if (!inUi && !inRenderer) continue;
      if (file.endsWith(".css")) {
        // renderer 里的全局 .css 只查结构性的两条（backdrop-filter、[data-platform]）
        const valueRules = inUi || file.endsWith(".module.css");
        errors.push(...checkCssFile(file, readText(root, file), baseVars, valueRules));
      } else if (file.endsWith(".tsx") && !TEST_FILE.test(file)) {
        errors.push(...checkTsxFile(file, readText(root, file)));
      }
    }
    return errors;
  },
};
