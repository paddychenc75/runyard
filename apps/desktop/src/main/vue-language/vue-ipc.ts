import type { VueDocument, VueMethods, VueRequest } from "../../shared/vue-language.ts";
import type { VueChannel } from "./vue-channel.ts";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
function target(value: unknown) {
  const p = record(value);
  return p && text(p.project) && text(p.path) ? { project: p.project, path: p.path } : null;
}
function document(value: unknown): VueDocument | null {
  const p = record(value);
  const file = target(value);
  return p &&
    file &&
    text(p.session) &&
    typeof p.text === "string" &&
    p.text.length <= 5_242_880 &&
    integer(p.version)
    ? { ...file, text: p.text, version: p.version, session: p.session }
    : null;
}
function request(value: unknown): VueRequest | null {
  const p = record(value);
  const file = target(value);
  if (!p || !file || !text(p.requestId)) return null;
  const base = { ...file, requestId: p.requestId };
  if (p.kind === "diagnostics") return { ...base, kind: p.kind };
  if (p.kind === "completionDetails" && text(p.detailId))
    return { ...base, kind: p.kind, detailId: p.detailId };
  const position = record(p.position);
  if (
    !["completion", "hover", "definition"].includes(String(p.kind)) ||
    !position ||
    !integer(position.line) ||
    !integer(position.character)
  )
    return null;
  return {
    ...base,
    kind: p.kind as VueRequest["kind"],
    position: { line: position.line, character: position.character },
  };
}
export function vueMethods(
  channel?: VueChannel,
): Record<keyof VueMethods, (param: unknown) => unknown> {
  const invalid = { ok: false, reason: "invalid" } as const;
  return {
    "vue.open": (value) => {
      const parsed = document(value);
      return parsed && channel ? channel.open(parsed) : invalid;
    },
    "vue.sync": (value) => {
      const parsed = document(value);
      return parsed && channel ? channel.sync(parsed) : invalid;
    },
    "vue.close": (value) => {
      const file = target(value);
      const p = record(value);
      return file && p && integer(p.version) && text(p.session)
        ? channel?.closeDocument({ ...file, version: p.version, session: p.session })
        : undefined;
    },
    "vue.request": (value) => {
      const parsed = request(value);
      return parsed && channel ? channel.request(parsed) : invalid;
    },
    "vue.cancel": (value) => {
      const p = record(value);
      if (p && text(p.project) && text(p.requestId)) channel?.cancel(p.project, p.requestId);
    },
  };
}
