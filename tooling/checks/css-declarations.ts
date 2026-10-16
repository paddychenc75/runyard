// 把 CSS 文本切成声明和选择器两类片段，带行号。给 style-tokens 用。
// 为什么不引入 CSS 解析库：技术设计 §3.3 规定这个检查是“逐行正则，不引入 CSS 解析库”；
// 这里只做最小的切分：去掉注释，在括号外按 ; { } 断开，以 { 结尾的是选择器或 @规则，其余是声明。

export interface CssDeclaration {
  line: number;
  property: string;
  value: string;
}

export interface CssPrelude {
  line: number;
  text: string;
}

export function stripCssComments(css: string): string {
  // 保留换行，行号才对得上
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

export function splitCss(css: string): { declarations: CssDeclaration[]; preludes: CssPrelude[] } {
  const text = stripCssComments(css);
  const declarations: CssDeclaration[] = [];
  const preludes: CssPrelude[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  let line = 1;
  let startLine = 1;
  const flush = (end: number, terminator: string) => {
    const raw = text.slice(start, end);
    const body = raw.trim();
    if (body !== "") {
      // 片段第一行的行号：跳过开头的空白行
      const lead = raw.length - raw.trimStart().length;
      const firstLine = startLine + (raw.slice(0, lead).match(/\n/g)?.length ?? 0);
      if (terminator === "{") {
        preludes.push({ line: firstLine, text: body });
      } else {
        const colon = body.indexOf(":");
        const property = colon === -1 ? "" : body.slice(0, colon).trim();
        if (/^(?:--)?[A-Za-z_-][\w-]*$/.test(property)) {
          declarations.push({ line: firstLine, property, value: body.slice(colon + 1).trim() });
        }
      }
    }
    start = end + 1;
    startLine = line;
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index] as string;
    if (char === "\n") line++;
    if (quote !== "") {
      if (char === quote && text[index - 1] !== "\\") quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (char === ";" || char === "{" || char === "}")) {
      flush(index, char);
    }
  }
  flush(text.length, ";");
  return { declarations, preludes };
}
