import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 技术设计 §6.8 第 1、2 层：界面里写死文字，Biome 的 noJsxLiterals 和两条 GritQL 规则要拦住。
// 为什么真跑 Biome：规则写在 biome.json 的 overrides 和 tooling/biome/*.grit 里，只有真跑才知道
// 路径范围和规则本身都生效。临时目录里放真实的 biome.json 和规则文件的副本，不往仓库里写夹具。
const REPO = join(import.meta.dirname, "../..");
const BIOME = join(REPO, "node_modules/.bin/biome");

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "runyard-biome-rules-"));
  cpSync(join(REPO, "biome.json"), join(dir, "biome.json"));
  cpSync(join(REPO, "tooling/biome"), join(dir, "tooling/biome"), { recursive: true });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// 返回 Biome 报出的规则名列表（lint/style/noJsxLiterals 或 plugin）
function lint(path: string, code: string): { exitCode: number | null; rules: string[] } {
  const file = join(dir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, code);
  const run = spawnSync(BIOME, ["lint", "--max-diagnostics=100", path], {
    cwd: dir,
    encoding: "utf8",
  });
  const rules = [...`${run.stdout}${run.stderr}`.matchAll(/\.tsx:\d+:\d+ ([\w/]+) ━/g)].map(
    (m) => m[1] as string,
  );
  return { exitCode: run.status, rules };
}

const wrap = (jsx: string) => `export const A = () => (${jsx});\n`;
const PATHS = [
  "apps/desktop/src/renderer/a.tsx",
  "packages/ui/src/a.tsx",
  "packages/i18n/src/react/a.tsx",
];

describe.each(PATHS)("界面里写死文字被 Biome 拦住：%s", (path) => {
  it.each([
    ["JSX 标签之间的文字", "<p>还没有项目</p>", "lint/style/noJsxLiterals"],
    ["表达式里的字符串字面量", '<p>{"文字"}</p>', "plugin"],
    ["表达式里的模板字符串", "<p>{`文字`}</p>", "plugin"],
    ["三元表达式的一支是字面量", '<p>{ok ? "是" : t("x")}</p>', "plugin"],
    ["逻辑或的右边是字面量", '<p>{name || "默认"}</p>', "plugin"],
    ["原生元素的 aria-label", '<button aria-label="关闭" />', "plugin"],
    ["原生元素的 title", '<span title="提示">{t("x")}</span>', "plugin"],
    ["原生元素的 placeholder", '<input placeholder="搜索" />', "plugin"],
    ["原生元素的 alt（表达式字面量）", '<img alt={"图"} />', "plugin"],
  ])("%s", (_name, jsx, rule) => {
    const result = lint(path, wrap(jsx));
    expect(result.exitCode).not.toBe(0);
    expect(result.rules).toContain(rule);
  });

  it("走 t()、变量、纯符号、组件属性放行", () => {
    const jsx = `<div>
      <p>{t("library.title")}</p>
      {ok ? t("a") : t("b")}
      <span>{name}</span>
      <span>·</span>
      <button type="button" aria-label={t("ui.close.aria")} title={t("ui.close.tooltip")} />
      <Button label="保存" />
    </div>`;
    const result = lint(path, wrap(jsx));
    expect(result.rules).toEqual([]);
    expect(result.exitCode).toBe(0);
  });
});

describe("规则的范围", () => {
  it("范围之外的目录和测试文件不查", () => {
    expect(lint("packages/core/src/a.tsx", wrap("<p>文字</p>")).rules).toEqual([]);
    expect(lint("packages/ui/src/a.test.tsx", wrap("<p>文字</p>")).rules).toEqual([]);
  });
});
