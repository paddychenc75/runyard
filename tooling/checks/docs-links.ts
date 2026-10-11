import { posix } from "node:path";
import { listFiles, pathExists, proseLines, readText } from "./docs.ts";
import type { Check } from "./workspace.ts";

// docs-links：Markdown 里指向仓库内文件和标题的链接都能点开（技术设计 §9.4）。
// 范围是仓库里全部 Markdown，包括两份产品文档。站外链接（http、mailto）不查。
// “说明文件只引用仓库里有的文件”靠这一项落实：链接指到仓库外面（比如本机归档）就红。

// 把标题变成 GitHub 生成的锚点名：小写，去掉标点，空格换成连字符
export function headingSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, "")
    .replace(/ /g, "-");
}

// 一份 Markdown 里可以被 #锚点 指到的全部名字：标题生成的，加 <a id="…"> 写明的
export function anchorsOf(text: string): Set<string> {
  const anchors = new Set<string>();
  for (const match of text.matchAll(/<a\s+id="([^"]+)"/g)) anchors.add(match[1] as string);
  for (const line of proseLines(text)) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading !== null) anchors.add(headingSlug(heading[1] as string));
  }
  // 标题里的行内代码也算进锚点名，所以再用原文算一遍
  for (const raw of text.split("\n")) {
    const heading = /^#{1,6}\s+(.*)$/.exec(raw);
    if (heading !== null) anchors.add(headingSlug((heading[1] as string).replaceAll("`", "")));
  }
  return anchors;
}

export const docsLinks: Check = {
  name: "docs-links",
  run(root) {
    const files = listFiles(root);
    const errors: string[] = [];
    const anchorCache = new Map<string, Set<string>>();
    const anchors = (path: string) => {
      let found = anchorCache.get(path);
      if (found === undefined) {
        found = anchorsOf(readText(root, path));
        anchorCache.set(path, found);
      }
      return found;
    };
    for (const file of files.filter((path) => path.endsWith(".md"))) {
      proseLines(readText(root, file)).forEach((line, index) => {
        for (const match of line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
          const target = match[1] as string;
          if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:、mailto: 等站外链接
          const where = `${file}:${index + 1}`;
          const [pathPart = "", fragment] = target.split("#");
          const resolved =
            pathPart === "" ? file : posix.normalize(posix.join(posix.dirname(file), pathPart));
          if (resolved.startsWith("..")) {
            errors.push(
              `${where} 的链接 ${target} 指到了仓库外面。说明文件只能引用仓库里的文件；把需要的内容写进仓库再链接，或删掉这个链接。`,
            );
            continue;
          }
          if (!pathExists(files, decodeURIComponent(resolved))) {
            errors.push(
              `${where} 的链接 ${target} 指向的文件不存在（${resolved}）。改成正确的相对路径，或删掉这个链接。`,
            );
            continue;
          }
          if (fragment !== undefined && fragment !== "" && resolved.endsWith(".md")) {
            if (!anchors(resolved).has(decodeURIComponent(fragment).toLowerCase())) {
              errors.push(
                `${where} 的链接 ${target} 里的锚点 #${fragment} 在 ${resolved} 里不存在。核对标题或 <a id> 的名字。`,
              );
            }
          }
        }
      });
    }
    return errors;
  },
};
