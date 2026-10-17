import type { SaveTemplateRequest } from "../../../shared/templates-view.ts";
import { filesUnder, type PathNode } from "./path-tree.ts";

// 另存为模板弹窗的纯判断：标识的校验和默认值、文件树勾选转成保存请求。不碰 DOM，所以可以直接测。

// 与协议包的 templateIdPattern 是同一条规则（测试里互相核对）；界面进程不导入协议包的值，免得把 zod 打进界面
const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export type IdProblem = "invalid" | "taken" | null;

/** 标识的行内校验（规格 DESKTOP-TEMPLATES-VIEW-08）：没填不报错，只是不能保存 */
export function idProblem(id: string, taken: readonly string[]): IdProblem {
  if (id === "") return null;
  if (!ID_PATTERN.test(id)) return "invalid";
  return taken.includes(id) ? "taken" : null;
}

/** 项目名转成标识：小写，非字母数字的连续部分变成一个连字符，去掉首尾的连字符 */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 标识的初始值：项目名转出来合法且没被占用就用它，否则留空让用户自己填 */
export function initialId(projectName: string, taken: readonly string[]): string {
  const slug = slugOf(projectName);
  return slug !== "" && idProblem(slug, taken) === null ? slug : "";
}

/** 去掉勾的默认包含项：整个文件夹都去掉勾就只写文件夹，否则逐个写文件 */
export function excludePaths(nodes: readonly PathNode[], unchecked: ReadonlySet<string>): string[] {
  return nodes.flatMap((node) => {
    if (!node.directory) return unchecked.has(node.path) ? [node.path] : [];
    const files = filesUnder(node);
    if (files.length > 0 && files.every((file) => unchecked.has(file))) return [node.path];
    return excludePaths(node.children, unchecked);
  });
}

export interface SaveDraft {
  playground: string;
  id: string;
  name: string;
  description: string;
  replaceName: boolean;
  tree: readonly PathNode[];
  unchecked: ReadonlySet<string>;
  /** 勾上的“默认不包含”项 */
  included: ReadonlySet<string>;
}

export function saveRequestOf(draft: SaveDraft): SaveTemplateRequest {
  return {
    playground: draft.playground,
    id: draft.id,
    name: draft.name,
    description: draft.description,
    replaceName: draft.replaceName,
    include: [...draft.included].sort(),
    exclude: excludePaths(draft.tree, draft.unchecked),
  };
}
