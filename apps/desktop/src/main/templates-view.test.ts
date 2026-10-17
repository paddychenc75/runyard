import type { Playground, TemplateDetail, TemplateRecord, ToolCheck } from "@runyard/protocol";
import { describe, expect, it, vi } from "vitest";
import { playground, template } from "./library-fixtures.ts";
import { TemplatesView } from "./templates-view.ts";

// 模板页和另存弹窗背后的整理逻辑：管理进程的回答用假客户端给。

const nodeRequires = {
  node: { version: ">=20.19 <27" },
  pnpm: { version: ">=9", fallback: "npm" },
};

function detail(record: TemplateRecord, extra: Partial<TemplateDetail> = {}): TemplateDetail {
  return {
    template: record,
    path: `/templates/${record.id}`,
    files: ["package.json"],
    runner: {
      setup: { pnpm: ["pnpm", "install"], npm: ["npm", "install"] },
      run: ["node", "server.js", "--port", "{port}"],
      ready: { http: { path: "/" }, slowAfterMs: 30000 },
    },
    problems: [],
    ...extra,
  };
}

interface World {
  records: TemplateRecord[];
  details: Record<string, TemplateDetail>;
  checks?: ToolCheck[];
  playgrounds?: Playground[];
}

function setup(world: World) {
  const calls: { method: string; params: unknown }[] = [];
  const revealed: string[] = [];
  const refresh = vi.fn(async () => {});
  const client = {
    call: vi.fn(async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params });
      switch (method) {
        case "template.list":
          return world.records;
        case "template.get": {
          const found = world.details[params.id as string];
          if (found === undefined) throw new Error("no template");
          return found;
        }
        case "toolchain.check":
          return { tools: world.checks ?? [] };
        case "playground.list":
          return world.playgrounds ?? [];
        case "template.save":
          return { id: params.as, name: params.name, path: "/x", files: [], source: "user" };
        default:
          throw new Error(method);
      }
    }),
  };
  const view = new TemplatesView({
    client: client as never,
    reveal: (path) => revealed.push(path),
    home: "/Users/me",
    refresh,
  });
  return { view, calls, revealed, refresh };
}

describe("TemplatesView.list", () => {
  it("[DESKTOP-TEMPLATES-VIEW-01] 内置和用户的都列出，用户的一律归在“我的”，无效的带第一条问题", async () => {
    const react = template("react19");
    const mine = template("team", { source: "user", category: "frontend" });
    const broken = template("broken", { source: "user", valid: false });
    const { view } = setup({
      records: [react, mine, broken],
      details: {
        broken: detail(broken, { problems: [{ rule: "runner-not-found", path: "runner" }] }),
      },
    });
    const rows = await view.list();
    expect(rows.map((row) => [row.key, row.category, row.valid])).toEqual([
      ["builtin:react19", "frontend", true],
      ["user:team", "mine", true],
      ["user:broken", "mine", false],
    ]);
    expect(rows[2]?.problem).toEqual({ rule: "runner-not-found", path: "runner" });
  });

  it("[DESKTOP-TEMPLATES-VIEW-02] 被内置标识挡住的同名用户模板：原因是标识重名", async () => {
    const builtin = template("react19");
    const shadow = template("react19", { source: "user", valid: false });
    const { view } = setup({ records: [builtin, shadow], details: { react19: detail(builtin) } });
    const rows = await view.list();
    expect(rows[1]).toMatchObject({
      key: "user:react19",
      problem: { rule: "template-id-reserved" },
    });
  });

  it("每次读都重读磁盘，并让选择器的状态一起更新（手写的模板不用重启）", async () => {
    const { view, calls, refresh } = setup({ records: [], details: {} });
    await view.list();
    await view.list();
    expect(calls.filter((call) => call.method === "template.list")).toHaveLength(2);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("TemplatesView.detail", () => {
  it("[DESKTOP-TEMPLATES-VIEW-03] 运行环境表合并已有的检测结果；运行方式取本机检测到的包管理器", async () => {
    const react = template("react19", { requires: nodeRequires });
    const { view } = setup({
      records: [react],
      details: { react19: detail(react) },
      checks: [
        { tool: "node", status: "found", version: "25.6.0" },
        { tool: "pnpm", status: "found", version: "10.30.1" },
      ],
    });
    const found = await view.detail("react19", "builtin");
    expect(found?.tools).toEqual([
      { tool: "node", required: ">=20.19 <27", fallback: null, version: "25.6.0", status: "found" },
      { tool: "pnpm", required: ">=9", fallback: "npm", version: "10.30.1", status: "found" },
    ]);
    expect(found?.run).toEqual({
      install: "pnpm install",
      start: "node server.js --port {port}",
      ready: { http: { path: "/" }, slowAfterMs: 30000 },
    });
  });

  it("[DESKTOP-TEMPLATES-VIEW-04] 没检测过的工具版本留空、状态是 unknown；只读缓存，不触发检测", async () => {
    const go = template("go", { requires: { go: { version: ">=1.22 <2" } } });
    const { view, calls } = setup({ records: [go], details: { go: detail(go) } });
    const found = await view.detail("go", "builtin");
    expect(found?.tools).toEqual([
      { tool: "go", required: ">=1.22 <2", fallback: null, version: null, status: "unknown" },
    ]);
    expect(calls.filter((call) => call.method.startsWith("toolchain"))).toEqual([
      { method: "toolchain.check", params: { template: "go", cachedOnly: true } },
    ]);
  });

  it("检测结果读不到时当作都没检测过；模板没了或来源对不上是 null", async () => {
    const react = template("react19", { requires: nodeRequires });
    const world = { records: [react], details: { react19: detail(react) } };
    const { view } = setup(world);
    expect(
      (await view.detail("react19", "builtin"))?.tools.every((tool) => tool.status === "unknown"),
    ).toBe(true);
    expect(await view.detail("react19", "user")).toBeNull();
    expect(await view.detail("nope", "builtin")).toBeNull();
  });

  it("没有安装步骤的运行器：安装依赖是 null；运行器读不出整块是 null", async () => {
    const html = template("html");
    const { view } = setup({
      records: [html],
      details: { html: detail(html, { runner: { setup: {}, run: null, ready: null } }) },
    });
    expect((await view.detail("html", "builtin"))?.run).toEqual({
      install: null,
      start: null,
      ready: null,
    });
    const ghost = template("ghost");
    const second = setup({ records: [ghost], details: { ghost: detail(ghost, { runner: null }) } });
    expect((await second.view.detail("ghost", "builtin"))?.run).toBeNull();
  });
});

describe("TemplatesView.reveal", () => {
  it("[DESKTOP-TEMPLATES-VIEW-06] 在访达里选中这个模板的文件夹（只发请求）；来源对不上不动", async () => {
    const mine = template("team", { source: "user" });
    const { view, revealed } = setup({ records: [mine], details: { team: detail(mine) } });
    await view.reveal("team", "user");
    await view.reveal("team", "builtin");
    expect(revealed).toEqual(["/templates/team"]);
  });
});

describe("TemplatesView.save", () => {
  it("[DESKTOP-TEMPLATES-VIEW-09] 把弹窗的内容交给 template.save，成功后重读状态让选择器立即有它", async () => {
    const { view, calls, refresh } = setup({ records: [], details: {} });
    const result = await view.save({
      playground: "hono-todo-api",
      id: "todo-api",
      name: "  待办接口起步 ",
      description: " ",
      replaceName: true,
      include: [".env"],
      exclude: ["dist"],
    });
    expect(result).toEqual({ ok: true, id: "todo-api" });
    expect(calls[0]).toEqual({
      method: "template.save",
      params: {
        playground: "hono-todo-api",
        as: "todo-api",
        name: "待办接口起步",
        description: "",
        replaceName: true,
        include: [".env"],
        exclude: ["dist"],
      },
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("名称留空就用标识；失败原样交回，不重读", async () => {
    const { view, calls } = setup({ records: [], details: {} });
    await view.save({
      playground: "p",
      id: "x",
      name: "",
      description: "",
      replaceName: false,
      include: [],
      exclude: [],
    });
    expect(calls[0]?.params).toMatchObject({ name: "x" });
  });
});

describe("TemplatesView.savePlan", () => {
  it("[DESKTOP-TEMPLATES-VIEW-07] 项目不存在、文件夹找不到分别回 PLAYGROUND_NOT_FOUND、FOLDER_MISSING", async () => {
    const gone = { ...playground("gone"), missingSince: 5 };
    const { view } = setup({ records: [], details: {}, playgrounds: [gone] });
    expect(await view.savePlan("nope")).toMatchObject({
      ok: false,
      error: { code: "PLAYGROUND_NOT_FOUND" },
    });
    expect(await view.savePlan("gone")).toMatchObject({
      ok: false,
      error: { code: "FOLDER_MISSING", params: { name: "gone" } },
    });
  });
});
