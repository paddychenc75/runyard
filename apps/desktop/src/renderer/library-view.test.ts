import { describe, expect, it } from "vitest";
import type { LibraryState } from "../shared/library-state.ts";
import { buildLibraryView, pickLocalizedText } from "./library-view.ts";

const empty: LibraryState = { locale: "en", playgrounds: [], templates: [], error: null };

describe("buildLibraryView", () => {
  it("没有项目时给出空列表提示", () => {
    expect(buildLibraryView(empty).emptyHint).toBe(
      "No playgrounds yet. Create one from a template below.",
    );
    expect(buildLibraryView({ ...empty, locale: "zh-CN" }).emptyHint).toContain("还没有项目");
  });

  it("每个项目显示状态；进行中的给停止按钮，其余给运行按钮", () => {
    const view = buildLibraryView({
      ...empty,
      playgrounds: [
        {
          id: "a",
          name: "a",
          kind: "server",
          state: "idle",
          active: false,
          previewing: false,
          busy: false,
        },
        {
          id: "b",
          name: "b",
          kind: "server",
          state: "ready",
          active: true,
          previewing: true,
          busy: true,
        },
      ],
    });
    expect(view.emptyHint).toBeNull();
    expect(view.rows.map((row) => [row.stateLabel, row.action, row.actionLabel, row.busy])).toEqual(
      [
        ["Not running", "run", "Run", false],
        ["Ready", "stop", "Stop", true],
      ],
    );
  });

  it("模板名按当前语言取，缺这种语言时用英文", () => {
    expect(pickLocalizedText({ en: "Plain HTML", "zh-CN": "纯 HTML" }, "zh-CN")).toBe("纯 HTML");
    expect(pickLocalizedText({ en: "Plain HTML" }, "zh-CN")).toBe("Plain HTML");
    expect(pickLocalizedText("React", "en")).toBe("React");
  });

  it("错误用 errors.<码>.title 的文案，带参数", () => {
    const view = buildLibraryView({
      ...empty,
      error: { code: "SUPERVISOR_UNAVAILABLE", params: {} },
    });
    expect(view.errorText).toMatch(/^Error: /);
    expect(view.errorText).not.toContain("errors.");
  });
});
