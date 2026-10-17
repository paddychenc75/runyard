import { join } from "node:path";
import { lintTemplateRef } from "@runyard/core";
import { type AbsPath, absPath } from "@runyard/platform";
import {
  type ErrorCode,
  errorRegistry,
  type TemplateDetail,
  type TemplateRecord,
} from "@runyard/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { LibraryWorld, type Pump } from "./library-harness.test.ts";

// 模板组方法：内置模板放在假文件系统的 /app/templates 下（supervisor-harness 给的位置），用户模板在状态目录。

let lw = new LibraryWorld();
afterEach(() => lw.dispose());

const runner = (id: string) => ({
  formatVersion: 1,
  id,
  kind: "server",
  needs: ["node"],
  run: { command: ["node", "server.js", "--port", "{port}", "--host", "127.0.0.1"] },
  ready: { http: { path: "/" } },
  preview: { type: "web" },
  watch: { mode: "none" },
  stop: { mode: "graceful" },
});
const nodeTool = {
  formatVersion: 1,
  id: "node",
  supported: ">=22 <27",
  detect: { args: ["--version"], pattern: "v(\\d+\\.\\d+\\.\\d+)" },
  install: { darwin: { url: "https://nodejs.org/en/download" } },
};
const template = (id: string, overrides: Record<string, unknown> = {}) => ({
  formatVersion: 1,
  id,
  name: { en: `Template ${id}`, "zh-CN": `模板 ${id}` },
  description: "Demo",
  category: "frontend",
  runner: "node-server",
  requires: { node: { version: ">=22.18 <27" } },
  entry: "src/main.ts",
  maintainer: "Runyard",
  ...overrides,
});

const app = (...parts: string[]): AbsPath => absPath(join("/app/templates", ...parts));
const userDir = (...parts: string[]): AbsPath =>
  absPath(join(lw.world.fake.platform.paths.stateDir, "templates", ...parts));

function put(dir: AbsPath, json: unknown, files: Record<string, string> = {}): void {
  lw.fs.writeFile(absPath(join(dir, "template.json")), JSON.stringify(json));
  for (const [path, text] of Object.entries({ "src/main.ts": "export {};\n", ...files })) {
    lw.fs.writeFile(absPath(join(dir, "files", path)), text);
  }
}

async function setup(): Promise<Pump> {
  lw = new LibraryWorld();
  lw.fs.writeFile(
    app("runners", "node-server", "runner.json"),
    JSON.stringify(runner("node-server")),
  );
  lw.fs.writeFile(app("tools", "node.json"), JSON.stringify(nodeTool));
  await lw.start();
  return lw.client();
}

const list = (pump: Pump) => pump.result<TemplateRecord[]>("template.list", {});
const lintRules = async (ref: string): Promise<string[]> => {
  const outcome = await lintTemplateRef(
    lw.world.fake.platform,
    {
      builtinDir: app("builtin"),
      runnersDir: app("runners"),
      toolsDir: app("tools"),
      userDir: userDir(),
    },
    ref,
  );
  return outcome.kind === "linted"
    ? outcome.result.errors.map((issue) => issue.rule)
    : ["not-found"];
};

describe("template.list 与 template.get", () => {
  it("[CLI-COMMANDS-68] 内置模板都在，每项含约定的键，source 是 builtin", async () => {
    const pump = await setup();
    // 内置模板的内容由模板各 issue 放进仓库；这里用同样数量的替身，核对列出的方式
    const ids = Array.from({ length: 11 }, (_, index) => `builtin-${index + 1}`);
    for (const id of ids) put(app("builtin", id), template(id));
    const records = await list(pump);
    expect(records.map((record) => record.id)).toEqual(ids.sort());
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual(
        [
          "category",
          "description",
          "id",
          "kind",
          "name",
          "requires",
          "runner",
          "source",
          "tags",
          "valid",
        ].sort(),
      );
      expect(record).toMatchObject({ source: "builtin", valid: true, kind: "server" });
    }
    // 名称原样带着模板里的值，不随语言挑选
    expect(records[0]?.name).toEqual({ en: "Template builtin-1", "zh-CN": "模板 builtin-1" });
  });

  it("[CLI-COMMANDS-70] get 返回记录、绝对路径和文件列表，文件是相对路径、没有反斜杠", async () => {
    const pump = await setup();
    put(app("builtin", "react19"), template("react19"), { "src/components/App.tsx": "x" });
    const detail = await pump.result<{ template: TemplateRecord; path: string; files: string[] }>(
      "template.get",
      { id: "react19" },
    );
    expect(detail.template).toMatchObject({ id: "react19", source: "builtin" });
    expect(detail.path).toBe(app("builtin", "react19"));
    expect(detail.files).toEqual(["src/components/App.tsx", "src/main.ts"]);
    expect(detail.files.some((file) => file.startsWith("/") || file.includes("\\"))).toBe(false);
  });

  it("[DESKTOP-TEMPLATES-VIEW-03] get 带运行方式摘要：安装命令按包管理器、启动命令、就绪判断；运行器不存在时是 null", async () => {
    const pump = await setup();
    put(app("builtin", "react19"), template("react19"));
    put(app("builtin", "ghost"), template("ghost", { runner: "missing-runner" }));
    const detail = await pump.result<TemplateDetail>("template.get", { id: "react19" });
    expect(detail.runner).toEqual({
      setup: {},
      run: ["node", "server.js", "--port", "{port}", "--host", "127.0.0.1"],
      ready: { http: { path: "/" }, slowAfterMs: 30000 },
    });
    expect(detail.problems).toEqual([]);
    expect((await pump.result<TemplateDetail>("template.get", { id: "ghost" })).runner).toBeNull();
  });

  it("[DESKTOP-TEMPLATES-VIEW-02] 无效的用户模板：get 带 lint 的错误，模板页据此写原因", async () => {
    const pump = await setup();
    put(userDir("hello"), template("hi", { maintainer: undefined }));
    const detail = await pump.result<TemplateDetail>("template.get", { id: "hello" });
    expect(detail.template.valid).toBe(false);
    expect(detail.problems.map((issue) => issue.rule)).toContain("template-json-invalid");
  });

  it("不存在的标识报 TEMPLATE_NOT_FOUND；路径形状的入参不能用来读任意文件夹", async () => {
    const pump = await setup();
    put(userDir("hello"), template("hello", { maintainer: undefined }));
    expect(await pump.errorCode("template.get", { id: "nope" })).toBe("TEMPLATE_NOT_FOUND");
    expect(await pump.errorCode("template.get", { id: userDir("hello") })).toBe(
      "TEMPLATE_NOT_FOUND",
    );
  });

  it("[TEMPLATES-CUSTOM-17] 手写的模板放进约定位置，不重启就在列表里：source 是 user，valid 是 true", async () => {
    const pump = await setup();
    expect(await list(pump)).toEqual([]);
    put(userDir("hello"), template("hello", { maintainer: undefined, category: "mine" }), {
      "main.py": "print(1)\n",
    });
    const records = await list(pump);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "hello", source: "user", valid: true });
  });

  it("[TEMPLATES-CUSTOM-18] 标识和文件夹名不一致：valid 为 false，lint 报 template-json-invalid", async () => {
    const pump = await setup();
    put(userDir("hello"), template("hi", { maintainer: undefined }));
    const [record] = await list(pump);
    expect(record).toMatchObject({ id: "hello", source: "user", valid: false });
    expect(await lintRules("hello")).toContain("template-json-invalid");
  });

  it("[TEMPLATES-CUSTOM-20] 用户模板自带的 runner.json 不被当作运行器：指定的运行器不存在时 valid 为 false，lint 报 runner-not-found", async () => {
    const pump = await setup();
    const dir = userDir("mine");
    put(dir, template("mine", { runner: "my-own", maintainer: undefined }));
    lw.fs.writeFile(absPath(join(dir, "runner.json")), JSON.stringify(runner("my-own")));
    const [record] = await list(pump);
    expect(record).toMatchObject({ id: "mine", valid: false, kind: null });
    expect(await lintRules("mine")).toContain("runner-not-found");
  });

  it("内置的标识优先：同标识的用户模板在列表里 valid 为 false，get 取到内置的，lint 报 template-id-reserved", async () => {
    const pump = await setup();
    put(app("builtin", "react19"), template("react19"));
    put(userDir("react19"), template("react19", { maintainer: undefined }));
    const records = (await list(pump)).filter((record) => record.id === "react19");
    expect(records.map((record) => [record.source, record.valid])).toEqual([
      ["builtin", true],
      ["user", false],
    ]);
    const detail = await pump.result<{ template: TemplateRecord; path: string }>("template.get", {
      id: "react19",
    });
    expect(detail).toMatchObject({
      template: { source: "builtin" },
      path: app("builtin", "react19"),
    });
    expect(await lintRules(userDir("react19"))).toContain("template-id-reserved");
  });

  it("坏的 template.json 只让它自己 valid 为 false，不弄坏列表；另存时留下的临时目录不算模板", async () => {
    const pump = await setup();
    put(userDir("good"), template("good", { maintainer: undefined }));
    lw.fs.writeFile(userDir("broken", "template.json"), "{ not json");
    lw.fs.writeFile(userDir(".saving-x-1", "template.json"), "{}");
    const records = await list(pump);
    expect(records.map((record) => [record.id, record.valid])).toEqual([
      ["broken", false],
      ["good", true],
    ]);
  });
});

describe("template.save", () => {
  async function withProject(pump: Pump, name = "pricing-table") {
    const created = await lw.create(pump, name);
    const dir = created.playground.path;
    lw.fs.writeFile(absPath(join(dir, "src", "App.tsx")), `// ${name}\n`);
    return dir;
  }

  it("[TEMPLATES-CUSTOM-23] 另存两个不同标识的模板：两个都在列表里，互不影响；结果带 id、绝对 path、files、source", async () => {
    const pump = await setup();
    await withProject(pump);
    const first = await pump.result<{ id: string; path: string; files: string[]; source: string }>(
      "template.save",
      { playground: "pricing-table", as: "my-pricing", name: "My pricing" },
    );
    expect(first).toMatchObject({ id: "my-pricing", name: "My pricing", source: "user" });
    expect(first.path).toBe(userDir("my-pricing"));
    expect(first.files).toEqual(["index.js", "src/App.tsx"]);
    // 不重启就出现在列表里，运行器和运行环境沿用项目里记下的
    expect(await list(pump)).toEqual([
      expect.objectContaining({
        id: "my-pricing",
        source: "user",
        valid: true,
        runner: "node-server",
        name: "My pricing",
        requires: { node: { version: ">=24" } },
      }),
    ]);
    await pump.result("template.save", { playground: "pricing-table", as: "other-one" });
    expect((await list(pump)).map((record) => record.id)).toEqual(["my-pricing", "other-one"]);
    expect(lw.fs.readText(userDir("my-pricing", "files", "src", "App.tsx"))).toBe(
      "// pricing-table\n",
    );
  });

  it("[TEMPLATES-CUSTOM-03] 非法标识要得到 NAME_INVALID（带对象种类 template），不是 USAGE，也不生成任何文件夹", async () => {
    const pump = await setup();
    await withProject(pump);
    for (const as of ["My_Template", "-a", "a-"]) {
      const response = await pump.call("template.save", { playground: "pricing-table", as });
      expect(response).toMatchObject({
        ok: false,
        error: { code: "NAME_INVALID", params: { name: as, kind: "template" } },
      });
    }
    expect(lw.fs.listDirs(userDir())).toEqual([]);
    // 只放宽了这一个入参：空串、缺少这个入参仍然是 USAGE
    expect(await pump.errorCode("template.save", { playground: "pricing-table", as: "" })).toBe(
      "USAGE",
    );
    expect(await pump.errorCode("template.save", { playground: "pricing-table" })).toBe("USAGE");
  });

  it("[TEMPLATES-CUSTOM-04] 标识被用户模板或内置模板占用报 NAME_EXISTS（内置的优先），已有文件不动", async () => {
    const pump = await setup();
    await withProject(pump);
    put(app("builtin", "react19"), template("react19"));
    await pump.result("template.save", { playground: "pricing-table", as: "my-pricing" });
    const before = lw.fs.readText(userDir("my-pricing", "template.json"));
    for (const as of ["my-pricing", "react19"]) {
      const response = await pump.call("template.save", { playground: "pricing-table", as });
      expect(response).toMatchObject({
        ok: false,
        error: { code: "NAME_EXISTS", params: { name: as, kind: "template" } },
      });
    }
    expect(lw.fs.readText(userDir("my-pricing", "template.json"))).toBe(before);
    // 用户手写的 react19 不挡内置的：内置的优先，另存同标识同样被拒
    expect(lw.fs.exists(userDir("react19"))).toBe(false);
  });

  it("同一个标识同时另存两次：只有一次成功，另一次报 NAME_EXISTS，没有残片", async () => {
    const pump = await setup();
    await withProject(pump);
    const other = await lw.client(false);
    const outcomes = await Promise.all([
      pump.call("template.save", { playground: "pricing-table", as: "twin" }),
      other.call("template.save", { playground: "pricing-table", as: "twin" }),
    ]);
    expect(outcomes.map((response) => response.ok).sort()).toEqual([false, true]);
    expect(outcomes.find((response) => response.ok === false)).toMatchObject({
      error: { code: "NAME_EXISTS" },
    });
    expect(lw.fs.listDirs(userDir())).toEqual(["twin"]);
  });

  it("[TEMPLATES-CUSTOM-08] 项目不存在、文件夹被移走的项目分别报 PLAYGROUND_NOT_FOUND 和 FOLDER_MISSING，退出码都是 3", async () => {
    const pump = await setup();
    const dir = await withProject(pump, "gone");
    expect(await pump.errorCode("template.save", { playground: "nope", as: "x1" })).toBe(
      "PLAYGROUND_NOT_FOUND",
    );
    lw.fs.remove(absPath(dir));
    await pump.result("library.rescan", {});
    expect(await pump.errorCode("template.save", { playground: "gone", as: "x1" })).toBe(
      "FOLDER_MISSING",
    );
    for (const code of ["PLAYGROUND_NOT_FOUND", "FOLDER_MISSING"] as ErrorCode[]) {
      expect(errorRegistry[code].exit).toBe(3);
    }
    expect(lw.fs.listDirs(userDir())).toEqual([]);
  });

  it("[TEMPLATES-CUSTOM-13] 不合法的 include、exclude 路径报 USAGE，没有生成模板", async () => {
    const pump = await setup();
    await withProject(pump);
    expect(
      await pump.errorCode("template.save", {
        playground: "pricing-table",
        as: "x1",
        include: ["../outside"],
      }),
    ).toBe("USAGE");
    expect(
      await pump.errorCode("template.save", {
        playground: "pricing-table",
        as: "x1",
        exclude: ["/etc/passwd"],
      }),
    ).toBe("USAGE");
    expect(lw.fs.listDirs(userDir())).toEqual([]);
  });
});
