// `watch.paths` 和 `watch.ignore` 的匹配（runner-format.md 第 1 节的 watch；规格 RUN-SCRIPTS-14）。
// 写法是相对项目文件夹、用 `/` 分隔的简化通配：`**` 跨任意层目录（含零层），`*` 不跨目录，`?` 一个非 `/` 字符。
// 都从项目文件夹起算（锚定），`__pycache__/**` 只管顶层那个目录。

const cache = new Map<string, RegExp>();

function compile(pattern: string): RegExp {
  // `dir/**` 连目录本身也匹配：建立或删除这个目录的事件同样要忽略
  if (pattern.endsWith("/**")) {
    const head = compile(pattern.slice(0, -3)).source.slice(1, -1);
    return new RegExp(`^${head}(?:/.*)?$`);
  }
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern.charAt(i);
    if (char === "*" && pattern.charAt(i + 1) === "*") {
      const slashAfter = pattern.charAt(i + 2) === "/";
      source += slashAfter ? "(?:.*/)?" : ".*";
      i += slashAfter ? 2 : 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

export function matchesGlob(pattern: string, path: string): boolean {
  let regex = cache.get(pattern);
  if (regex === undefined) {
    regex = compile(pattern);
    cache.set(pattern, regex);
  }
  return regex.test(path);
}

/** 路径要不要触发：在 ignore 里的不触发；有 paths 时只有匹配其中之一的才触发 */
export function isWatched(
  path: string,
  rule: { readonly paths?: readonly string[]; readonly ignore?: readonly string[] },
): boolean {
  if (rule.ignore?.some((pattern) => matchesGlob(pattern, path)) === true) return false;
  if (rule.paths === undefined || rule.paths.length === 0) return true;
  return rule.paths.some((pattern) => matchesGlob(pattern, path));
}

/** `dir/**` 这类整棵目录都忽略的写法，取出目录名交给平台层，让它根本不去监听那棵树 */
export function ignoredDirectories(ignore: readonly string[] | undefined): string[] {
  return (ignore ?? [])
    .filter((pattern) => pattern.endsWith("/**") && !/[*?]/.test(pattern.slice(0, -3)))
    .map((pattern) => pattern.slice(0, -3));
}
