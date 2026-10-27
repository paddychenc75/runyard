import { describe, expect, it } from "vitest";
import type { PlaygroundRow } from "../shared/library-state.ts";
import {
  applySortChoice,
  canCreateFromSearch,
  defaultDirection,
  defaultQuery,
  filterRows,
  isFiltering,
  navCounts,
  statusGroupOf,
} from "./library-query.ts";

function row(id: string, extra: Partial<PlaygroundRow> = {}): PlaygroundRow {
  return {
    id,
    name: id,
    path: `/lib/${id}`,
    kind: "server",
    state: "idle",
    active: false,
    previewing: false,
    busy: false,
    note: "",
    templateId: "html",
    templateName: null,
    port: null,
    autoClean: { enabled: false, days: null },
    lastUsedAt: 1,
    lastOpenedAt: null,
    createdBy: { kind: "user" },
    createdAt: 1,
    missing: false,
    ...extra,
  };
}

describe("statusGroupOf", () => {
  it("找不到文件夹和失败类是有问题，进行中是运行中，其余已停止", () => {
    expect(statusGroupOf(row("a", { missing: true }))).toBe("problem");
    expect(statusGroupOf(row("a", { state: "crashed" }))).toBe("problem");
    expect(statusGroupOf(row("a", { state: "errored" }))).toBe("problem");
    expect(statusGroupOf(row("a", { state: "installing" }))).toBe("running");
    expect(statusGroupOf(row("a", { state: "ready" }))).toBe("running");
    expect(statusGroupOf(row("a", { state: "finished" }))).toBe("stopped");
    expect(statusGroupOf(row("a"))).toBe("stopped");
  });
});

describe("navCounts", () => {
  it("[DESKTOP-LIBRARY-VIEW-22] 运行中、自动清理和智能体创建分别计数", () => {
    const rows = [
      row("a", { state: "installing" }),
      row("b", { autoClean: { enabled: true, days: 7 } }),
      row("c", { createdBy: { kind: "cli", agent: "Codex" } }),
      row("d", { createdBy: { kind: "cli" } }),
    ];
    expect(navCounts(rows)).toEqual({ all: 4, running: 1, autoClean: 1, agent: 1 });
  });
});

describe("filterRows", () => {
  it("[DESKTOP-LIBRARY-VIEW-94] 最近使用排序：打开和使用里较晚的一次，从没打开过的看使用（命令行运行、创建），名字兜底", () => {
    const rows = [
      row("b", { lastUsedAt: 5 }),
      row("a", { lastUsedAt: 5 }),
      row("c", { lastOpenedAt: 9 }),
    ];
    expect(filterRows(rows, [], "zh-CN", defaultQuery).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("isFiltering 只看搜索和三种筛选，不看排序", () => {
    expect(isFiltering(defaultQuery)).toBe(false);
    expect(isFiltering({ ...defaultQuery, sort: "name" })).toBe(false);
    expect(isFiltering({ ...defaultQuery, status: "problem" })).toBe(true);
  });
});

describe("canCreateFromSearch", () => {
  it("空的、不合法的、已被占用的都不给新建", () => {
    const rows = [row("taken")];
    expect(canCreateFromSearch("", rows)).toBe(false);
    expect(canCreateFromSearch("Hello World", rows)).toBe(false);
    expect(canCreateFromSearch("taken", rows)).toBe(false);
    expect(canCreateFromSearch("websocket", rows)).toBe(true);
  });
});

it("[DESKTOP-LIBRARY-VIEW-90] 运行中覆盖暂存的状态筛选，离开后恢复", () => {
  const rows = [
    row("idle"),
    row("starting", { state: "starting" }),
    row("script", { kind: "oneshot", state: "running" }),
  ];
  const query = { ...defaultQuery, status: "stopped" as const };
  expect(filterRows(rows, [], "zh-CN", { ...query, nav: "running" }).map((r) => r.id)).toEqual([
    "script",
    "starting",
  ]);
  expect(filterRows(rows, [], "zh-CN", query).map((r) => r.id)).toEqual(["idle"]);
});
it("[DESKTOP-LIBRARY-VIEW-91] 自动清理仅显示已开启的项目", () => {
  const rows = [row("off"), row("on", { autoClean: { enabled: true, days: 7 } })];
  expect(
    filterRows(rows, [], "zh-CN", { ...defaultQuery, nav: "autoClean" }).map((r) => r.id),
  ).toEqual(["on"]);
});

describe("排序方向", () => {
  const rows = () => [
    row("a", {
      lastUsedAt: 1,
      createdAt: 1,
      size: { totalBytes: 5, dependencyBytes: 0, dependencyDirs: [], unreadable: 0 },
    }),
    row("b", {
      lastUsedAt: 3,
      createdAt: 3,
      size: { totalBytes: 9, dependencyBytes: 0, dependencyDirs: [], unreadable: 0 },
    }),
    row("c", { lastUsedAt: 2, createdAt: 2, size: null }),
  ];
  const ids = (query: Parameters<typeof filterRows>[3]) =>
    filterRows(rows(), [], "zh-CN", query).map((r) => r.id);

  it("[DESKTOP-LIBRARY-VIEW-110] 默认方向：名称 A 到 Z，其余最大或最新在前", () => {
    expect(defaultDirection("name")).toBe("ascending");
    expect(defaultDirection("recent")).toBe("descending");
    expect(defaultDirection("size")).toBe("descending");
    expect(defaultDirection("created")).toBe("descending");
  });

  it("[DESKTOP-LIBRARY-VIEW-110] 升序把顺序倒过来；大小未知的两个方向都在最后", () => {
    const base = defaultQuery;
    expect(ids({ ...base, sort: "recent" })).toEqual(["b", "c", "a"]);
    expect(ids({ ...base, sort: "recent", sortDirection: "ascending" })).toEqual(["a", "c", "b"]);
    expect(ids({ ...base, sort: "name", sortDirection: "ascending" })).toEqual(["a", "b", "c"]);
    expect(ids({ ...base, sort: "name", sortDirection: "descending" })).toEqual(["c", "b", "a"]);
    expect(ids({ ...base, sort: "size" })).toEqual(["b", "a", "c"]);
    expect(ids({ ...base, sort: "size", sortDirection: "ascending" })).toEqual(["a", "b", "c"]);
    expect(ids({ ...base, sort: "created", sortDirection: "ascending" })).toEqual(["a", "c", "b"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-110] 选当前键切换方向，选别的键用它的默认方向", () => {
    expect(applySortChoice(defaultQuery, "recent")).toEqual({
      sort: "recent",
      sortDirection: "ascending",
    });
    expect(applySortChoice(defaultQuery, "name")).toEqual({
      sort: "name",
      sortDirection: "ascending",
    });
    expect(
      applySortChoice({ ...defaultQuery, sort: "name", sortDirection: "ascending" }, "size"),
    ).toEqual({
      sort: "size",
      sortDirection: "descending",
    });
  });

  it("[DESKTOP-LIBRARY-VIEW-110] 运行中的无论升降序都在最前", () => {
    const list = [row("a", { lastUsedAt: 1 }), row("z", { active: true, lastUsedAt: 0 })];
    expect(
      filterRows(list, [], "zh-CN", { ...defaultQuery, sortDirection: "ascending" }).map(
        (r) => r.id,
      ),
    ).toEqual(["z", "a"]);
  });
});
