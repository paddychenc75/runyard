import { describe, expect, it } from "vitest";
import type { CreateRequest, CreateResult } from "../../shared/desktop-bridge.ts";
import type { LinkConfirmView, LinkNoticeCode } from "../../shared/library-state.ts";
import { LinkHandler, type LinkHost, SKIP_CONFIRM_INTERVAL_MS } from "./link-handler.ts";

// 链接处理的行为（规格 desktop/links）：假的宿主记下窗口、项目和提示上发生的事

function setup(options: { projects?: string[]; skip?: boolean; createResult?: CreateResult } = {}) {
  const log = {
    focus: 0,
    opened: [] as string[],
    created: [] as CreateRequest[],
    notices: [] as [LinkNoticeCode, string | null][],
    confirm: null as LinkConfirmView | null,
  };
  let now = 1_000_000;
  const names = options.projects ?? ["demo"];
  const host: LinkHost = {
    playgrounds: () => names.map((name) => ({ id: `id-${name}`, name })),
    templates: () => [
      { id: "html", name: { en: "HTML", "zh-CN": "静态页面" }, category: "page" },
      { id: "vue3", name: { en: "Vue 3", "zh-CN": "Vue 3" }, category: "frontend" },
      { id: "react19", name: { en: "React 19", "zh-CN": "React 19" }, category: "frontend" },
      { id: "todo-api", name: { en: "todo", "zh-CN": "todo" }, category: "mine" },
    ],
    libraryRoot: () => "~/Runyard",
    focus: () => {
      log.focus += 1;
    },
    openProject: async (id) => void log.opened.push(id),
    create: async (request) => {
      log.created.push(request);
      return options.createResult ?? { ok: true };
    },
    skipConfirmForBuiltin: async () => options.skip ?? false,
    notify: (code, value) => void log.notices.push([code, value]),
    pendingChanged: (view) => {
      log.confirm = view;
    },
    now: () => now,
  };
  return {
    log,
    handler: new LinkHandler(host),
    advance: (ms: number) => {
      now += ms;
    },
    names,
  };
}

describe("runyard://open", () => {
  it("[DESKTOP-LINKS-01] 打开已有项目：窗口提到前面，打开它的标签页", async () => {
    const { handler, log } = setup();
    await handler.handle("runyard://open/demo");
    expect(log.focus).toBe(1);
    expect(log.opened).toEqual(["id-demo"]);
    expect(log.notices).toEqual([]);
  });

  it("[DESKTOP-LINKS-02] 已经开着也只是交给“打开项目”，由它切过去而不是再启动一次", async () => {
    const { handler, log } = setup();
    await handler.handle("runyard://open/demo");
    await handler.handle("runyard://open/demo");
    expect(log.opened).toEqual(["id-demo", "id-demo"]);
    expect(log.created).toEqual([]);
  });

  it("[DESKTOP-LINKS-03] 没有这个项目：提示名称，什么都不打开也不创建", async () => {
    const { handler, log } = setup();
    await handler.handle("runyard://open/nope");
    expect(log.notices).toEqual([["open-missing", "nope"]]);
    expect(log.opened).toEqual([]);
    expect(log.created).toEqual([]);
  });

  it("[DESKTOP-LINKS-04] 不合法的名称：只提示，不去查资源库也不打开任何东西", async () => {
    const { handler, log } = setup({ projects: ["etc"] });
    await handler.handle("runyard://open/..%2Fetc");
    expect(log.notices).toEqual([["open-invalid", null]]);
    expect(log.opened).toEqual([]);
    expect(log.focus).toBe(0);
  });
});

describe("runyard://new", () => {
  it("[DESKTOP-LINKS-06] 弹出确认：自称的来源、模板、自动取的名称和文件夹；确认前什么都没创建", async () => {
    const { handler, log } = setup({ projects: ["react19-1", "react19-3"] });
    await handler.handle("runyard://new/react19?source=docs.example.dev");
    expect(log.confirm).toEqual({
      source: "docs.example.dev",
      fromProject: null,
      template: { id: "react19", name: { en: "React 19", "zh-CN": "React 19" } },
      name: "react19-4",
      folder: "~/Runyard/react19-4",
    });
    expect(log.created).toEqual([]);
    expect(log.focus).toBe(1);
  });

  it("[DESKTOP-LINKS-07] 没带来源时来源是空，界面写“未知来源”", async () => {
    const { handler, log } = setup();
    await handler.handle("runyard://new/html");
    expect(log.confirm?.source).toBeNull();
  });

  it("[DESKTOP-LINKS-08] 取消（回车、Esc 都走这里）：确认框收起，没有创建", async () => {
    const { handler, log } = setup();
    await handler.handle("runyard://new/html");
    handler.cancel();
    expect(log.confirm).toBeNull();
    expect(log.created).toEqual([]);
    // 取消后可以再来新的请求
    await handler.handle("runyard://new/vue3");
    expect(log.confirm?.template.id).toBe("vue3");
  });

  it("[DESKTOP-LINKS-09] 确认后用链接里的名称、备注、清理天数创建，并走“新建并运行”", async () => {
    const { handler, log } = setup();
    await handler.handle(
      "runyard://new/html?name=landing&note=%E9%A6%96%E9%A1%B5%E8%AF%95%E9%AA%8C&clean-after=7d",
    );
    await handler.confirm();
    expect(log.created).toEqual([
      { template: "html", name: "landing", note: "首页试验", autoClean: 7 },
    ]);
    expect(log.confirm).toBeNull();
  });

  it("没有待确认的请求时点确认什么都不会发生", async () => {
    const { handler, log } = setup();
    await handler.confirm();
    expect(log.created).toEqual([]);
  });

  it("[DESKTOP-LINKS-10] 不存在的模板：提示，没有确认框也没有创建", async () => {
    const { handler, log } = setup();
    await handler.handle("runyard://new/rails");
    expect(log.notices).toEqual([["new-no-template", "rails"]]);
    expect(log.confirm).toBeNull();
    expect(log.created).toEqual([]);
  });

  it("[DESKTOP-LINKS-11] 名称已被占用或不合法：提示，没有确认框也没有创建", async () => {
    const { handler, log } = setup({ projects: ["landing"] });
    await handler.handle("runyard://new/html?name=landing");
    await handler.handle("runyard://new/html?name=..%2Fx");
    expect(log.notices).toEqual([
      ["new-name-taken", "landing"],
      ["new-name-invalid", "../x"],
    ]);
    expect(log.confirm).toBeNull();
    expect(log.created).toEqual([]);
  });

  it("[DESKTOP-LINKS-12] 多余的参数不进确认框，确认后创建的项目与不带它们时相同", async () => {
    const { handler, log } = setup();
    await handler.handle("runyard://new/html?cmd=rm%20-rf&path=/tmp");
    expect(JSON.stringify(log.confirm)).not.toMatch(/rm|tmp/);
    await handler.confirm();
    const withExtra = log.created[0];
    await handler.handle("runyard://new/html");
    await handler.confirm();
    expect(withExtra).toEqual(log.created[1]);
    expect(withExtra).toEqual({ template: "html", name: "html-1", note: "", autoClean: null });
  });

  it("[DESKTOP-LINKS-13] 从项目预览页发出的请求，确认框写明那个项目的名称", async () => {
    const { handler, log } = setup({ projects: ["docs-demo"] });
    await handler.handle("runyard://new/html", "id-docs-demo");
    expect(log.confirm?.fromProject).toBe("docs-demo");
  });

  it("创建失败（如重名赛跑）给一句提示，不抛出", async () => {
    const { handler, log } = setup({
      createResult: { ok: false, error: { code: "NAME_EXISTS", params: { name: "html-1" } } },
    });
    await handler.handle("runyard://new/html");
    await handler.confirm();
    expect(log.notices).toEqual([["new-name-taken", "html-1"]]);
  });
});

describe("同一时间一个请求与免确认", () => {
  it("[DESKTOP-LINKS-14] 确认框开着时又来的 new 链接被丢弃并提示，确认框仍是第一个", async () => {
    const { handler, log } = setup();
    await handler.handle("runyard://new/html");
    await handler.handle("runyard://new/vue3");
    expect(log.notices).toEqual([["new-busy", null]]);
    expect(log.confirm?.template.id).toBe("html");
    await handler.confirm();
    expect(log.created.map((request) => request.template)).toEqual(["html"]);
  });

  it("[DESKTOP-LINKS-15] 免确认打开：内置模板直接新建并运行，用户模板仍弹确认", async () => {
    const { handler, log } = setup({ skip: true });
    await handler.handle("runyard://new/html");
    expect(log.created.map((request) => request.template)).toEqual(["html"]);
    expect(log.confirm).toBeNull();
    await handler.handle("runyard://new/todo-api");
    expect(log.confirm?.template.id).toBe("todo-api");
    expect(log.created).toHaveLength(1);
  });

  it("免确认关着时内置模板照样每次确认", async () => {
    const { handler, log } = setup({ skip: false });
    await handler.handle("runyard://new/html");
    expect(log.confirm).not.toBeNull();
    expect(log.created).toEqual([]);
  });

  it("[DESKTOP-LINKS-16] 免确认时 1 秒内连点三次只创建一个，另两次被丢弃并提示；5 秒后又可以", async () => {
    const { handler, log, advance } = setup({ skip: true });
    await handler.handle("runyard://new/html");
    advance(500);
    await handler.handle("runyard://new/html");
    advance(500);
    await handler.handle("runyard://new/html");
    expect(log.created).toHaveLength(1);
    expect(log.notices).toEqual([
      ["new-throttled", null],
      ["new-throttled", null],
    ]);
    advance(SKIP_CONFIRM_INTERVAL_MS);
    await handler.handle("runyard://new/html");
    expect(log.created).toHaveLength(2);
  });
});
