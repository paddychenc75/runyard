import {
  type CommandGroup,
  type CommandId,
  commandIds,
  commandRegistry,
} from "../../../shared/commands.ts";
import { type FuzzyMatch, fuzzyMatch } from "./fuzzy.ts";

// 命令面板和快速打开列表的纯逻辑：给定能用的命令（或项目里的文件）、查询和最近用过的，排出要显示的行。
// 不碰 DOM、不生成文字（名称由调用方经文案包给）。

/** 命令面板输入为空时“最近使用”最多几条（规格“命令面板”要求） */
export const MAX_RECENT_COMMANDS = 5;
/** 快速打开输入为空时最多列几个最近的文件 */
export const MAX_RECENT_FILES = 10;
/** 输入文字后最多显示几行：再往后的没人会去滚 */
export const MAX_RESULTS = 100;

export type CommandRowGroup = CommandGroup | "recent";

export interface CommandRow {
  id: CommandId;
  title: string;
  /** 命名里命中的字符下标 */
  titleHits: number[];
  /** 靠另一种语言的名字匹配上时，把那个名字写在后面（设计稿 CommandPaletteSearch 的 “Stop”） */
  alias: { text: string; hits: number[] } | null;
  group: CommandRowGroup;
}

export interface CommandRowsInput {
  available: readonly CommandId[];
  query: string;
  titles: Record<CommandId, string>;
  /** 另一种界面语言的名字（中文界面里输入英文名也能找到，规格 DESKTOP-EDITOR-58） */
  aliases: Record<CommandId, string>;
  /** 最近执行过的命令，最近的在前 */
  recent: readonly CommandId[];
}

export function commandRows(input: CommandRowsInput): CommandRow[] {
  const { available, query, titles, aliases, recent } = input;
  const usable = new Set(available);
  const order = (id: CommandId) => commandIds.indexOf(id);
  if (query.trim() === "") {
    const recents = recent.filter((id) => usable.has(id)).slice(0, MAX_RECENT_COMMANDS);
    const taken = new Set(recents);
    const rest = commandIds.filter((id) => usable.has(id) && !taken.has(id));
    return [
      ...recents.map((id): CommandRow => row(id, "recent", titles, null)),
      ...rest.map((id): CommandRow => row(id, commandRegistry[id].group, titles, null)),
    ];
  }
  const scored: { row: CommandRow; score: number; index: number }[] = [];
  for (const id of available) {
    const own = fuzzyMatch(query, titles[id]);
    const other = own === null ? fuzzyMatch(query, aliases[id]) : null;
    if (own === null && other === null) continue;
    const match = (own ?? other) as FuzzyMatch;
    scored.push({
      row: {
        id,
        title: titles[id],
        titleHits: own === null ? [] : own.positions,
        alias: own === null ? { text: aliases[id], hits: match.positions } : null,
        group: commandRegistry[id].group,
      },
      score: match.score,
      index: order(id),
    });
  }
  // 分数相同时名字短的在前（输入 stop，“Stop”排在“Stop all”前面）
  scored.sort(
    (a, b) => b.score - a.score || a.row.title.length - b.row.title.length || a.index - b.index,
  );
  return scored.slice(0, MAX_RESULTS).map((entry) => entry.row);
}

function row(
  id: CommandId,
  group: CommandRowGroup,
  titles: Record<CommandId, string>,
  alias: CommandRow["alias"],
): CommandRow {
  return { id, title: titles[id], titleHits: [], alias, group };
}

export interface FileRow {
  /** 项目内相对路径 */
  path: string;
  name: string;
  /** 所在文件夹（项目根下的文件是空串） */
  dir: string;
  nameHits: number[];
  dirHits: number[];
  recent: boolean;
}

export function splitPath(path: string): { name: string; dir: string } {
  const slash = path.lastIndexOf("/");
  return slash === -1
    ? { name: path, dir: "" }
    : { name: path.slice(slash + 1), dir: path.slice(0, slash) };
}

export interface FileRowsInput {
  files: readonly string[];
  query: string;
  /** 这个项目最近打开过的文件，最近的在前 */
  recent: readonly string[];
  /** 当前文件标签的文件：输入为空时不列它 */
  current: string | null;
}

export function fileRows(input: FileRowsInput): FileRow[] {
  const { files, query, recent, current } = input;
  if (query.trim() === "") {
    return recent
      .filter((path) => path !== current)
      .slice(0, MAX_RECENT_FILES)
      .map((path) => ({ path, ...splitPath(path), nameHits: [], dirHits: [], recent: true }));
  }
  const scored: { row: FileRow; tier: number; score: number }[] = [];
  for (const path of files) {
    const { name, dir } = splitPath(path);
    const inName = fuzzyMatch(query, name);
    if (inName !== null) {
      scored.push({
        row: { path, name, dir, nameHits: inName.positions, dirHits: [], recent: false },
        tier: 0,
        score: inName.score,
      });
      continue;
    }
    const inPath = fuzzyMatch(query, path);
    if (inPath === null) continue;
    const nameStart = path.length - name.length;
    scored.push({
      row: {
        path,
        name,
        dir,
        nameHits: inPath.positions.filter((at) => at >= nameStart).map((at) => at - nameStart),
        dirHits: inPath.positions.filter((at) => at < dir.length),
        recent: false,
      },
      // 文件名里的匹配排在只匹配到文件夹路径的前面（规格 DESKTOP-EDITOR-69）
      tier: 1,
      score: inPath.score,
    });
  }
  // 分数相同时，最近打开过的排前面（当前文件在最近列表的最前）
  const rank = (path: string) => {
    const at = recent.indexOf(path);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      b.score - a.score ||
      rank(a.row.path) - rank(b.row.path) ||
      a.row.path.length - b.row.path.length ||
      a.row.path.localeCompare(b.row.path),
  );
  return scored.slice(0, MAX_RESULTS).map((entry) => entry.row);
}
