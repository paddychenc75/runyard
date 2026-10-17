// 运行环境表里工具、版本范围和路径的写法（设计稿 Settings）。纯函数，不碰界面。

const TOOL_NAMES: Readonly<Record<string, string>> = {
  node: "Node",
  pnpm: "pnpm",
  npm: "npm",
  python: "Python",
  go: "Go",
  uv: "uv",
};

/** 工具的显示名：专有名词，不翻译；不认识的工具原样显示它的标识 */
export function toolName(id: string): string {
  return TOOL_NAMES[id] ?? id;
}

export interface RangePart {
  /** 比较符号，已换成数学写法；没有写符号的版本号是 "="  */
  operator: "≥" | "≤" | ">" | "<" | "=";
  version: string;
}

const OPERATORS: readonly [string, RangePart["operator"]][] = [
  [">=", "≥"],
  ["<=", "≤"],
  [">", ">"],
  ["<", "<"],
  ["=", "="],
];

/** “>=1.22 <2” 拆成 “≥ 1.22”“< 2”；界面用“且”（and）把它们连起来 */
export function rangeParts(range: string): RangePart[] {
  return range
    .split(/\s+/)
    .filter((token) => token !== "" && token !== "*")
    .map((token) => {
      const match = OPERATORS.find(([written]) => token.startsWith(written));
      return match === undefined
        ? { operator: "=", version: token }
        : { operator: match[1], version: token.slice(match[0].length) };
    });
}

/** 主目录写成 ~；路径太长时中间省略（完整路径放在悬停提示里） */
export function shortenPath(path: string): string {
  const home = path.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
  const parts = home.split("/");
  if (home.length <= 34 || parts.length <= 5) return home;
  return [...parts.slice(0, 2), "…", ...parts.slice(-3)].join("/");
}
