import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractVersion } from "../../packages/core/src/toolchain/index.ts";
import { checkTemplateData } from "./template-data.ts";

const repoRoot = join(import.meta.dirname, "..", "..");
const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); // delete-allow: 测试自己建的临时目录
});

function write(root: string, files: Record<string, unknown>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(
      join(root, path),
      typeof content === "string" ? content : JSON.stringify(content),
    );
  }
}

describe("仓库里的 templates/", () => {
  const report = checkTemplateData(repoRoot);

  it("[TEMPLATES-FORMAT-34] 内置工具齐全：六个都有，检测命令和 macOS 安装方式、官网链接都在，Go 用 go version", async () => {
    const { parseToolDefinitions } = await import("../../packages/core/src/templates/index.ts");
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = join(repoRoot, "templates", "tools");
    const set = parseToolDefinitions(
      readdirSync(dir).map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") })),
    );
    expect(set.problems).toEqual([]);
    expect([...set.definitions.keys()].sort()).toEqual([
      "go",
      "node",
      "npm",
      "pnpm",
      "python",
      "uv",
    ]);
    for (const definition of set.definitions.values()) {
      expect(definition.detect.args.length).toBeGreaterThan(0);
      expect(definition.install.darwin.url).toMatch(/^https:\/\//);
      expect(definition.install.darwin.homebrew?.command[0]).toBe("brew");
    }
    expect(set.definitions.get("go")?.detect.args).toEqual(["version"]);
    expect(set.definitions.get("node")?.install.darwin.versionManagers?.[0]?.id).toBe("nvm");
    expect(set.definitions.get("python")?.executables).toEqual(["python3", "python"]);
  });

  it("检测的版本号写法能读出各工具真实的输出（输出取自本机实测）", async () => {
    const { parseToolDefinitions } = await import("../../packages/core/src/templates/index.ts");
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = join(repoRoot, "templates", "tools");
    const { definitions } = parseToolDefinitions(
      readdirSync(dir).map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") })),
    );
    const outputs: Record<string, [string, string]> = {
      node: ["v24.21.0\n", "24.21.0"],
      npm: ["11.8.0\n", "11.8.0"],
      pnpm: ["11.28.0\n", "11.28.0"],
      python: ["Python 3.14.3\n", "3.14.3"],
      uv: ["uv 0.11.7 (9d177269e 2026-04-15 aarch64-apple-darwin)\n", "0.11.7"],
      go: ["go version go1.26.2 darwin/arm64\n", "1.26.2"],
    };
    for (const [id, [output, version]] of Object.entries(outputs))
      expect(extractVersion(definitions.get(id) as never, output), id).toBe(version);
    expect(extractVersion(definitions.get("go") as never, "go version go1.27 darwin/arm64")).toBe(
      "1.27",
    );
  });

  it("现有的工具定义、运行器和内置模板全部合格", () => {
    expect(report.problems).toEqual([]);
    expect(report.results.filter((result) => !result.ok)).toEqual([]);
  });
});

describe("checkTemplateData 用临时目录里的好坏夹具", () => {
  const runner = {
    formatVersion: 1,
    id: "static-page",
    kind: "static",
    needs: [],
    preview: { type: "web" },
    watch: { mode: "none" },
    stop: { mode: "graceful" },
  };
  const template = {
    formatVersion: 1,
    id: "html",
    name: "HTML",
    description: "HTML",
    category: "page",
    runner: "static-page",
    requires: {},
    entry: "index.html",
    maintainer: "Runyard",
  };

  it("好的模板通过；坏的模板和对不上文件夹名的运行器都被报出", () => {
    const root = mkdtempSync(join(tmpdir(), "runyard-templates-"));
    temps.push(root);
    write(root, {
      "templates/runners/static-page/runner.json": runner,
      "templates/runners/other/runner.json": runner,
      "templates/builtin/html/template.json": template,
      "templates/builtin/html/files/index.html": "<p></p>",
      "templates/builtin/bad/template.json": { ...template, id: "bad", runner: "nope" },
      "templates/builtin/bad/files/index.html": "",
    });
    const report = checkTemplateData(root);
    expect(report.results.map((r) => [r.template, r.ok])).toEqual([
      ["bad", false],
      ["html", true],
    ]);
    expect(report.results[0]?.errors.map((e) => e.rule)).toEqual(["runner-not-found"]);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain("templates/runners/other/runner.json");
  });
});
