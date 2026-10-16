import { describe, expect, it } from "vitest";
import { lintTemplate, type TemplateFolder } from "./lint-template.ts";

type Raw = Record<string, unknown>;

const goodRunner: Raw = {
  formatVersion: 1,
  id: "vite",
  kind: "server",
  needs: ["node"],
  run: { command: ["node", "vite.js", "--port", "{port}", "--host", "127.0.0.1"] },
  ready: { http: { path: "/" } },
  preview: { type: "web" },
  watch: { mode: "none" },
  stop: { mode: "graceful" },
};
const goodTemplate: Raw = {
  formatVersion: 1,
  id: "demo",
  name: { en: "Demo", "zh-CN": "示例" },
  description: "Demo",
  category: "frontend",
  runner: "vite",
  requires: { node: { version: ">=22.18 <27" } },
  entry: "src/main.ts",
  variables: { title: "Hi" },
  substitute: ["index.html"],
  maintainer: "Runyard",
};
const goodFiles: Record<string, string> = {
  "src/main.ts": "export {};",
  "index.html": "<title>{{title}} {{name}}</title>",
  "package.json": JSON.stringify({ dependencies: { react: "19.3.0" } }),
  "pnpm-workspace.yaml": "allowBuilds:\n  esbuild: true\n",
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
};
const tools = new Set(["node", "pnpm", "npm"]);

function lint(
  template: Raw = goodTemplate,
  files = goodFiles,
  runners = new Map([["vite", goodRunner]]),
  builtin = true,
) {
  const folder: TemplateFolder = {
    templateJson: JSON.stringify(template),
    has: (path) => path in files,
    text: (path) => files[path],
  };
  return lintTemplate({ folder, builtin, runners, knownTools: tools, fallbackName: "folder" });
}
const without = (key: string, from: Raw = goodTemplate): Raw => {
  const copy = { ...from };
  delete copy[key];
  return copy;
};
const rules = (issues: { rule: string }[]) => issues.map((issue) => issue.rule).sort();

describe("template lint", () => {
  it("合格的模板：ok 为 true，没有错误", () => {
    const result = lint();
    expect(result).toEqual({ template: "demo", ok: true, errors: [], warnings: [] });
  });

  it("[TEMPLATES-FORMAT-38] 一次报全：缺 requires、命令里有 &&、stop 里有信号名", () => {
    const badRunner = {
      ...goodRunner,
      run: { command: ["pnpm", "install", "&&", "pnpm", "dev"] },
      stop: { mode: "graceful", signal: "SIGTERM" },
    };
    const result = lint(without("requires"), goodFiles, new Map([["vite", badRunner]]));
    expect(result.ok).toBe(false);
    expect(rules(result.errors)).toEqual([
      "command-shell-syntax",
      "requires-missing",
      "stop-signal-name",
    ]);
    expect(result.errors.find((e) => e.rule === "command-shell-syntax")?.path).toBe(
      "runner.run.command.2",
    );
  });

  it("[TEMPLATES-FORMAT-39] 运行器不存在报 runner-not-found", () => {
    const result = lint({ ...goodTemplate, runner: "no-such-runner" });
    expect(rules(result.errors)).toEqual(["runner-not-found"]);
    expect(result.ok).toBe(false);
  });

  it("[TEMPLATES-FORMAT-40] 依赖不是精确版本，path 指向这个依赖", () => {
    const files = {
      ...goodFiles,
      "package.json": JSON.stringify({
        dependencies: { react: "^19.3.0" },
        devDependencies: { vite: "latest", ok: "1.0.0" },
      }),
    };
    const result = lint(goodTemplate, files);
    expect(result.errors.map((e) => [e.rule, e.path])).toEqual([
      ["version-not-exact", "files/package.json.dependencies.react"],
      ["version-not-exact", "files/package.json.devDependencies.vite"],
    ]);
  });

  it("[TEMPLATES-FORMAT-41] 缺放行列表和锁文件", () => {
    const files = { ...goodFiles };
    delete files["pnpm-lock.yaml"];
    files["pnpm-workspace.yaml"] = "packages: []\n";
    expect(rules(lint(goodTemplate, files).errors)).toEqual([
      "allow-builds-missing",
      "lockfile-missing",
    ]);
    delete files["pnpm-workspace.yaml"];
    expect(rules(lint(goodTemplate, files).errors)).toEqual([
      "allow-builds-missing",
      "lockfile-missing",
    ]);
  });

  it("没有 package.json 的模板不查放行列表和锁文件", () => {
    const files = { "src/main.ts": "", "index.html": "{{title}}" };
    expect(lint(goodTemplate, files).ok).toBe(true);
  });

  it("入口缺失和变量没声明在同一次里报出，运行器的警告进 warnings", () => {
    const files = { ...goodFiles, "index.html": "{{color}}" };
    delete files["src/main.ts"];
    const runner = { ...goodRunner };
    const result = lint(
      { ...goodTemplate, requires: { node: { version: ">=22" } } },
      files,
      new Map([["vite", runner]]),
    );
    expect(rules(result.errors)).toEqual(["entry-missing", "variable-undeclared"]);
    expect(rules(result.warnings)).toEqual(["range-no-upper"]);
  });

  it("[TEMPLATES-FORMAT-10] 内置模板没有 maintainer 才报；用户模板不报", () => {
    expect(rules(lint(without("maintainer")).errors)).toEqual(["maintainer-missing"]);
    expect(lint(without("maintainer"), goodFiles, undefined, false).ok).toBe(true);
  });

  it("[TEMPLATES-FORMAT-11] 格式比程序新：只报 format-version-unsupported", () => {
    const result = lint({ ...goodTemplate, formatVersion: 2 });
    expect(rules(result.errors)).toEqual(["format-version-unsupported"]);
  });

  it("template.json 不是 JSON 时用文件夹名当结果名", () => {
    const folder: TemplateFolder = { templateJson: "{", has: () => false, text: () => undefined };
    const result = lintTemplate({
      folder,
      builtin: false,
      runners: new Map(),
      knownTools: tools,
      fallbackName: "folder",
    });
    expect(result.template).toBe("folder");
    expect(rules(result.errors)).toEqual(["template-json-invalid"]);
  });

  it("[TEMPLATES-FORMAT-31] 用到不认识的工具报 tool-unknown，写了 install 则通过", () => {
    const zig = { zig: { version: ">=0.14 <1" } };
    expect(rules(lint({ ...goodTemplate, requires: zig }).errors)).toEqual(["tool-unknown"]);
    const withInstall = {
      zig: { version: ">=0.14 <1", install: { url: "https://ziglang.org/download/" } },
    };
    expect(lint({ ...goodTemplate, requires: withInstall }).ok).toBe(true);
  });
});

describe("lint 与协议校验的分工", () => {
  it("运行器自身的问题以 runner. 为前缀", () => {
    const badRunner = { ...goodRunner, ready: undefined };
    const result = lint(goodTemplate, goodFiles, new Map([["vite", badRunner]]));
    expect(result.errors.map((e) => [e.rule, e.path])).toEqual([
      ["runner-invalid", "runner.ready"],
    ]);
  });
});
