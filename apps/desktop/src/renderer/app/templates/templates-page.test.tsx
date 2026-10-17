// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { TemplateRow } from "../../../shared/library-state.ts";
import {
  detailOf,
  libraryOf,
  name,
  pageRow,
  project,
  setupWorld,
  type WorldOptions,
} from "./templates-world.tsx";

afterEach(cleanup);

const row = (id: string, category: TemplateRow["category"]): TemplateRow => ({
  id,
  name: name(id, id),
  description: `${id} description`,
  category,
  unmaintained: false,
});

const react19 = pageRow("react19", "frontend", { name: name("React 19", "React 19") });
const goRow = pageRow("go", "script", { name: name("Go", "Go") });
const builtins = [
  pageRow("html", "page"),
  react19,
  pageRow("react18", "frontend"),
  pageRow("vue3", "frontend"),
  pageRow("node-ts", "script"),
  pageRow("python", "script"),
  goRow,
  pageRow("hono", "service"),
  pageRow("nuxt", "fullstack"),
];
const mine = [
  pageRow("team-react", "mine", { source: "user" }),
  pageRow("api-mock", "mine", { source: "user" }),
];

function world(extra: Partial<WorldOptions> = {}) {
  const rows = extra.rows ?? [...builtins, ...mine];
  return setupWorld({
    library: libraryOf(
      rows.map((candidate) => row(candidate.id, candidate.category)),
      // 资源库里有项目：空资源库首次启动会自动弹出选择器，盖住页面
      [project],
      { templateCount: rows.length, recentTemplates: [] },
    ),
    rows,
    details: {
      "builtin:react19": detailOf(react19, {
        tools: [
          {
            tool: "node",
            required: ">=20.19 <27",
            fallback: null,
            version: "25.6.0",
            status: "found",
          },
          { tool: "pnpm", required: ">=9", fallback: "npm", version: "10.30.1", status: "found" },
        ],
        run: {
          install: "pnpm install --prefer-offline",
          start: "node node_modules/vite/bin/vite.js --port {port}",
          ready: { http: { path: "/" }, slowAfterMs: 30000 },
        },
        files: ["index.html", "package.json", "src/App.tsx", "src/main.tsx"],
      }),
      "builtin:go": detailOf(goRow, {
        tools: [
          { tool: "go", required: ">=1.22 <2", fallback: null, version: null, status: "unknown" },
        ],
      }),
      "user:team-react": detailOf(mine[0] as never, {}),
    },
    ...extra,
  });
}

async function openTemplates(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /^模板/ }));
  return await screen.findByRole("heading", { name: "模板", level: 1 });
}

// 整个文件第一次画外壳要付一次冷启动的代价，慢机器上会挤占第一个用例的时限（#219、#234 同类）；提前热身
beforeAll(async () => {
  world();
  await screen.findByRole("button", { name: /^模板/ });
  cleanup();
});

describe("模板页", () => {
  it("[DESKTOP-TEMPLATES-VIEW-01] 点侧栏“模板”：没有顶栏，标题下写个数，最后的分组是“我的”，里面两行标“我的”", async () => {
    const user = userEvent.setup();
    world();
    // 侧栏“模板”可点，右边是模板总数
    const nav = await screen.findByRole("button", { name: /^模板/ });
    expect(nav.textContent).toContain("11");
    await openTemplates(user);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("button", { name: "新建" })).toBeNull();
    expect(await screen.findByText("9 个内置 · 2 个我的")).toBeTruthy();
    const groups = await screen.findAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "页面",
      "前端",
      "全栈",
      "脚本",
      "服务",
      "我的",
    ]);
    const last = groups[groups.length - 1] as HTMLElement;
    const options = within(last).getAllByRole("option");
    expect(options).toHaveLength(2);
    for (const option of options) expect(within(option).getByText("我的")).toBeTruthy();
  });

  it("[DESKTOP-TEMPLATES-VIEW-02] 无效的用户模板列在“我的”里，标明无效并写原因，“用它新建”不可点", async () => {
    const user = userEvent.setup();
    const broken = pageRow("broken", "mine", {
      source: "user",
      valid: false,
      problem: { rule: "runner-not-found", path: "runner" },
    });
    world({
      rows: [...builtins, broken],
      details: { "user:broken": detailOf(broken) },
    });
    await openTemplates(user);
    const option = await screen.findByRole("option", { name: /broken/ });
    expect(within(option).getByText("无效")).toBeTruthy();
    expect(within(option).getByText(/找不到它指定的运行器/)).toBeTruthy();
    await user.click(option);
    const detail = await screen.findByLabelText("模板详情");
    await waitFor(() =>
      expect(
        (within(detail).getByRole("button", { name: "用它新建" }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
  });

  it("[DESKTOP-TEMPLATES-VIEW-03] 选中 React 19：标识、运行环境表、安装和启动命令、文件树，没有编辑和删除", async () => {
    const user = userEvent.setup();
    world();
    await openTemplates(user);
    await user.click(await screen.findByRole("option", { name: /^React 19/ }));
    const detail = await screen.findByLabelText("模板详情");
    await within(detail).findByText("react19");
    const table = await within(detail).findByRole("table");
    const nodeRow = within(table).getByRole("row", { name: /Node/ });
    expect(nodeRow.textContent).toContain("≥ 20.19");
    expect(nodeRow.textContent).toContain("< 27");
    expect(nodeRow.textContent).toContain("25.6.0");
    expect(nodeRow.textContent).toContain("满足");
    expect(within(table).getByRole("row", { name: /pnpm/ }).textContent).toContain("10.30.1");
    expect(within(detail).getByText("没有 pnpm 时会改用 npm")).toBeTruthy();
    expect(within(detail).getByText("pnpm install --prefer-offline")).toBeTruthy();
    expect(within(detail).getByText(/vite\.js --port \{port\}/)).toBeTruthy();
    expect(within(detail).getByText("http://127.0.0.1:{port}/")).toBeTruthy();
    expect(within(detail).getByText("src")).toBeTruthy();
    expect(within(detail).getByText("App.tsx")).toBeTruthy();
    expect(within(detail).queryByRole("button", { name: /编辑|删除|复制/ })).toBeNull();
    expect(within(detail).getByText(/另存为模板/)).toBeTruthy();
  });

  it("[DESKTOP-TEMPLATES-VIEW-04] 没检测过的工具：“这台电脑”和状态留空，打开详情只读不检测", async () => {
    const user = userEvent.setup();
    const { calls } = world();
    await openTemplates(user);
    await user.click(await screen.findByRole("option", { name: /Go/ }));
    const detail = await screen.findByLabelText("模板详情");
    const goTool = await within(detail).findByRole("row", { name: /Go/ });
    const cells = within(goTool).getAllByRole("cell");
    expect(cells[1]?.textContent).toBe("");
    expect(cells[2]?.textContent).toBe("");
    expect(goTool.textContent).not.toContain("满足");
    // 界面一侧只调模板的读取，不碰检测
    for (const { method } of calls) expect(method.startsWith("toolchain")).toBe(false);
  });

  it("[DESKTOP-TEMPLATES-VIEW-05] 在 React 19 的详情里点“用它新建”：出现新建弹窗，模板是 react19", async () => {
    const user = userEvent.setup();
    world();
    await openTemplates(user);
    await user.click(await screen.findByRole("option", { name: /^React 19/ }));
    const detail = await screen.findByLabelText("模板详情");
    await within(detail).findByText("react19");
    await user.click(await within(detail).findByRole("button", { name: "用它新建" }));
    const dialog = await screen.findByRole("dialog", { name: "新建项目" });
    expect(within(dialog).getByText("模板：react19")).toBeTruthy();
  });

  it("用户模板详情里点“在访达中显示”：向主进程发 template.reveal（访达本身手动验证）", async () => {
    const user = userEvent.setup();
    const { call } = world();
    await openTemplates(user);
    await user.click(await screen.findByRole("option", { name: /team-react/ }));
    const detail = await screen.findByLabelText("模板详情");
    await user.click(await within(detail).findByRole("button", { name: "在访达中显示" }));
    expect(call).toHaveBeenCalledWith("template.reveal", { id: "team-react", source: "user" });
  });
});
