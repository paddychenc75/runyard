import { nameProblem } from "../../shared/project-name.ts";

// runyard:// 链接的解析（规格 DESKTOP-LINKS-01 至 04、06、12）：只认 open 和 new 两种，
// 其他参数一律丢掉；链接是外面发来的，什么都不能信。只做解析，不碰资源库。

export type ParsedLink =
  | { kind: "open"; name: string }
  | {
      kind: "new";
      template: string;
      /** 链接给了名称；没给是 undefined（按“模板标识加序号”自动取） */
      name?: string;
      note?: string;
      /** 自动清理天数；没给或写法不对都当没给 */
      cleanAfter?: number;
      /** 链接自称的来源，原样展示（Runyard 无法核实） */
      source?: string;
    }
  | { kind: "invalid"; reason: "name" | "unknown"; value: string | null };

const MAX_NOTE = 200;
const MAX_SOURCE = 80;
// 控制字符和双向文字控制符：来源要原样显示给人看，不能借它们改写版面
function isUnsafe(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

function clean(text: string, max: number): string | undefined {
  const kept = [...text].filter((char) => !isUnsafe(char.codePointAt(0) ?? 0)).join("");
  const value = kept.trim().slice(0, max);
  return value === "" ? undefined : value;
}

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function parseLink(address: string): ParsedLink {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { kind: "invalid", reason: "unknown", value: null };
  }
  if (url.protocol !== "runyard:") return { kind: "invalid", reason: "unknown", value: null };
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  const target = segments.length === 1 ? decode(segments[0] as string) : null;
  if (url.hostname === "open") {
    if (target === null || nameProblem(target, []) !== null) {
      return { kind: "invalid", reason: "name", value: null };
    }
    return { kind: "open", name: target };
  }
  if (url.hostname === "new" && target !== null && target !== "") {
    const days = /^(\d{1,4})d$/.exec(url.searchParams.get("clean-after") ?? "");
    const given = url.searchParams.get("name");
    const note = clean(url.searchParams.get("note") ?? "", MAX_NOTE);
    const source = clean(url.searchParams.get("source") ?? "", MAX_SOURCE);
    const cleanAfter = days === null ? 0 : Number(days[1]);
    return {
      kind: "new",
      template: target,
      ...(given === null || given === "" ? {} : { name: given }),
      ...(note === undefined ? {} : { note }),
      ...(cleanAfter > 0 ? { cleanAfter } : {}),
      ...(source === undefined ? {} : { source }),
    };
  }
  return { kind: "invalid", reason: "unknown", value: null };
}
