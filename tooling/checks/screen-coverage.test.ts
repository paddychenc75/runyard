import { expect, it } from "vitest";
import { readScreenScenes, screenCoverage } from "./screen-coverage.ts";

const boards = {
  "Main.dc.html": { title: "01 资源库", page: "zh" },
  "Unused.dc.html": { title: "32 长期未使用", page: "zh" },
  "Settings.dc.html": { title: "33 设置窗口", page: "zh" },
  "UpdateBanner.dc.html": { title: "55 有新版本", page: "zh" },
  "Notify.dc.html": { title: "56 通知", page: "zh" },
};
const entries = [
  { id: "Main", boards: ["Main"] },
  { id: "Settings", boards: ["Settings"] },
  { id: "Update", boards: ["UpdateBanner", "Notify"] },
];
it("有效画板与批准替代画面覆盖，32延期不造场景", () =>
  expect(screenCoverage(boards, entries)).toEqual([]));
it("故障注入：删掉设置场景或通知替代映射必须失败", () => {
  expect(
    screenCoverage(
      boards,
      entries.filter((entry) => entry.id !== "Settings"),
    ).join("\n"),
  ).toContain("Settings缺少");
  expect(screenCoverage(boards, entries.slice(0, 2)).join("\n")).toContain("UpdateBanner缺少");
});
it("虚构画板、重复场景及延期画板不能冒充有效覆盖", () => {
  const errors = screenCoverage(boards, [
    ...entries,
    { id: "Main", boards: ["Invented", "Unused"] },
  ]).join("\n");
  expect(errors).toContain("场景重复");
  expect(errors).toContain("不存在");
  expect(errors).toContain("延期");
});
it("登记必须是字面量，不能只在注释或运行时拼出名字", () => {
  expect(
    readScreenScenes('export const scenes = [{id:"Main", boards:["Main"], width:1440}] as const;'),
  ).toEqual([{ id: "Main", boards: ["Main"] }]);
  expect(readScreenScenes("// Main\nexport const scenes = makeScenes();")).toEqual([]);
});
