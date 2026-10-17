import type { SaveTemplateRequest, TemplateMethod } from "../shared/templates-view.ts";
import type { TemplatesView } from "./templates-view.ts";

// 把界面发来的模板消息接到控制器上。页面发来的数据不可信：形状不对一律不调用；
// 标识是否合法、是否被占用由管理进程判（回 NAME_INVALID、NAME_EXISTS）。

const rejected = { ok: false, error: { code: "INTERNAL", params: {} } } as const;

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function paths(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => text(item) !== null)
    ? (value as string[])
    : null;
}

function templateRef(value: unknown): { id: string; source: "builtin" | "user" } | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, source } = value as Record<string, unknown>;
  return text(id) !== null && (source === "builtin" || source === "user")
    ? { id: id as string, source }
    : null;
}

function saveRequest(value: unknown): SaveTemplateRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const { playground, id, name, description, replaceName, include, exclude } = value as Record<
    string,
    unknown
  >;
  const included = paths(include);
  const excluded = paths(exclude);
  if (text(playground) === null || text(id) === null) return null;
  if (typeof name !== "string" || typeof description !== "string") return null;
  if (typeof replaceName !== "boolean" || included === null || excluded === null) return null;
  return {
    playground: playground as string,
    id: id as string,
    name,
    description,
    replaceName,
    include: included,
    exclude: excluded,
  };
}

export function templateMethods(
  service: TemplatesView | undefined,
): Record<TemplateMethod, (param: unknown) => unknown> {
  // 没接线（测试里的最小装配）时当作没有模板服务
  const need = (): TemplatesView => {
    if (service === undefined) throw new Error("templates service unavailable");
    return service;
  };
  return {
    "template.list": () => need().list(),
    "template.detail": (param) => {
      const ref = templateRef(param);
      return ref === null ? null : need().detail(ref.id, ref.source);
    },
    "template.reveal": async (param) => {
      const ref = templateRef(param);
      if (ref !== null) await need().reveal(ref.id, ref.source);
    },
    "template.savePlan": (id) => {
      const playground = text(id);
      return playground === null ? rejected : need().savePlan(playground);
    },
    "template.save": (param) => {
      const request = saveRequest(param);
      return request === null ? rejected : need().save(request);
    },
  };
}
