import { describe, expect, it } from "vitest";
import { type CommandId, commandIds } from "../../../shared/commands.ts";
import { commandRows, fileRows } from "./palette-model.ts";

const titles = Object.fromEntries(commandIds.map((id) => [id, id])) as Record<CommandId, string>;
const zh: Partial<Record<CommandId, string>> = {
  "project.stop": "停止运行",
  "app.stopAll": "全部停止",
  "project.run": "运行",
};
const en: Partial<Record<CommandId, string>> = {
  "project.stop": "Stop",
  "app.stopAll": "Stop All",
  "project.run": "Run",
};
const names = { ...titles, ...zh } as Record<CommandId, string>;
const aliases = { ...titles, ...en } as Record<CommandId, string>;

describe("commandRows", () => {
  it("[DESKTOP-EDITOR-57] 输入为空时最近用过的排最前（最多 5 条，只列还能用的），其余按分组", () => {
    const rows = commandRows({
      available: ["project.run", "app.showTerminal", "editor.save", "project.reveal"],
      query: "",
      titles: names,
      aliases,
      recent: ["app.showTerminal", "project.stop", "project.reveal"],
    });
    expect(rows.map((r) => [r.id, r.group])).toEqual([
      ["app.showTerminal", "recent"],
      ["project.reveal", "recent"],
      ["project.run", "project"],
      ["editor.save", "editor"],
    ]);
  });

  it("[DESKTOP-EDITOR-58] 中文界面里输入中文或英文都能找到“停止运行”，英文名作为备注显示", () => {
    const available: CommandId[] = ["project.stop", "app.stopAll", "project.run"];
    const byZh = commandRows({ available, query: "停止", titles: names, aliases, recent: [] });
    expect(byZh.map((r) => r.id)).toEqual(["project.stop", "app.stopAll"]);
    expect(byZh[0]?.titleHits).toEqual([0, 1]);
    const byEn = commandRows({ available, query: "stop", titles: names, aliases, recent: [] });
    expect(byEn.map((r) => r.id).sort()).toEqual(["app.stopAll", "project.stop"]);
    expect(
      commandRows({ available, query: "stop", titles: aliases, aliases, recent: [] })[0]?.id,
    ).toBe("project.stop");
    expect(byEn.find((r) => r.id === "project.stop")?.alias).toEqual({
      text: "Stop",
      hits: [0, 1, 2, 3],
    });
  });

  it("[DESKTOP-EDITOR-61] 没登记的命令不会出现，哪怕名字能匹配上", () => {
    const rows = commandRows({
      available: ["project.run"],
      query: "停止",
      titles: names,
      aliases,
      recent: ["project.stop"],
    });
    expect(rows).toEqual([]);
  });
});

describe("fileRows", () => {
  const files = ["src/App.tsx", "src/App.css", "src/app-shell/index.ts", "index.html"];

  it("[DESKTOP-EDITOR-68] 输入为空时列最近打开的文件，当前文件除外，每行带所在文件夹", () => {
    const rows = fileRows({
      files,
      query: "",
      recent: ["src/App.tsx", "src/App.css", "src/main.tsx"],
      current: "src/App.tsx",
    });
    expect(rows.map((r) => [r.name, r.dir])).toEqual([
      ["App.css", "src"],
      ["main.tsx", "src"],
    ]);
  });

  it("[DESKTOP-EDITOR-69] 按相对路径模糊匹配：sapp 找得到 src/App.tsx", () => {
    const rows = fileRows({ files, query: "sapp", recent: [], current: null });
    expect(rows.map((r) => r.path)).toContain("src/App.tsx");
  });

  it("[DESKTOP-EDITOR-69] 分数相同时最近打开的排前面", () => {
    const rows = fileRows({
      files: ["src/App.css", "src/App.tsx"],
      query: "app",
      recent: ["src/App.tsx"],
      current: "src/App.tsx",
    });
    expect(rows.map((r) => r.path)).toEqual(["src/App.tsx", "src/App.css"]);
  });

  it("[DESKTOP-EDITOR-69] 文件名里的匹配排在只匹配到文件夹路径的前面，并给出高亮位置", () => {
    const rows = fileRows({ files, query: "app", recent: [], current: null });
    expect(rows.map((r) => r.path)).toEqual([
      "src/App.css",
      "src/App.tsx",
      "src/app-shell/index.ts",
    ]);
    expect(rows[0]?.nameHits).toEqual([0, 1, 2]);
    expect(rows[2]).toMatchObject({ nameHits: [], dirHits: [4, 5, 6] });
  });
});
