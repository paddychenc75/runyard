import { describe, expect, it } from "vitest";
import type { TemplateRow } from "../shared/library-state.ts";
import { buildPickerGroups } from "./picker-view.ts";

const labels = {
  recent: "recent" as never,
  categories: {
    page: "page",
    frontend: "frontend",
    fullstack: "fullstack",
    script: "script",
    service: "service",
    mine: "mine",
  } as never,
};

function row(id: string, category: TemplateRow["category"]): TemplateRow {
  return { id, name: id, description: id, category, unmaintained: false };
}

describe("buildPickerGroups 的模板标志", () => {
  it("有授权的内置模板带 logo，缩写兜底仍在；其余没有 logo", () => {
    const groups = buildPickerGroups(
      [row("html", "page"), row("react19", "frontend"), row("python", "script")],
      [],
      "en",
      labels,
    );
    const items = groups.flatMap((group) => group.items);
    expect(items.map((item) => [item.id, item.logo, item.letters])).toEqual([
      ["html", "html5", "Ht"],
      ["react19", undefined, "Re"],
      ["python", "python", "Py"],
    ]);
  });
});
