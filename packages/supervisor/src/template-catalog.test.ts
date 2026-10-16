import { join } from "node:path";
import { type AbsPath, absPath } from "@runyard/platform";
import type { TemplateRecord } from "@runyard/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { LibraryWorld, type Pump } from "./library-harness.test.ts";
import { createTemplateCatalog } from "./template-catalog.ts";

// 模板展开成项目（seed）：用小的夹具模板（假文件系统里），不依赖真正的内置模板。
// 内置模板放在 /app/templates/builtin，用户模板在状态目录下的 templates/。

let lw = new LibraryWorld();
afterEach(() => lw.dispose());

const app = (...parts: string[]): AbsPath => absPath(join("/app/templates", ...parts));
const userDir = (...parts: string[]): AbsPath =>
  absPath(join(lw.world.fake.platform.paths.stateDir, "templates", ...parts));

const runner = (id: string, kind: "server" | "oneshot" = "server") => ({
  formatVersion: 1,
  id,
  kind,
  needs: ["node"],
  run: { command: ["node", "main.js"] },
  ...(kind === "server"
    ? { ready: { http: { path: "/" } }, preview: { type: "web" } }
    : { preview: { type: "console" } }),
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

function put(dir: AbsPath, json: unknown, files: Record<string, string> = {}): void {
  lw.fs.writeFile(absPath(join(dir, "template.json")), JSON.stringify(json));
  for (const [path, text] of Object.entries({ "src/main.ts": "export {};\n", ...files })) {
    lw.fs.writeFile(absPath(join(dir, "files", path)), text);
  }
}

async function setup(detected: Record<string, string> = { node: "24.21.0" }): Promise<Pump> {
  lw = new LibraryWorld();
  lw.fs.writeFile(
    app("runners", "node-server", "runner.json"),
    JSON.stringify(runner("node-server")),
  );
  lw.fs.writeFile(
    app("runners", "node-script", "runner.json"),
    JSON.stringify(runner("node-script", "oneshot")),
  );
  lw.fs.writeFile(app("tools", "node.json"), JSON.stringify(nodeTool));
  const catalog = createTemplateCatalog({
    platform: lw.world.fake.platform,
    locations: {
      builtinDir: app("builtin"),
      runnersDir: app("runners"),
      toolsDir: app("tools"),
      userDir: userDir(),
    },
    appVersion: "0.1.0",
    detectVersions: async () => detected,
  });
  await lw.start({ templates: catalog });
  return lw.client();
}

const create = (
  pump: Pump,
  templateId: string,
  name: string,
  extra: Record<string, unknown> = {},
) =>
  pump.call("playground.create", {
    template: templateId,
    name,
    createdBy: { kind: "cli" },
    ...extra,
  });
const errorOf = async (response: Promise<Record<string, unknown>>) =>
  (await response).error as { code: string; params: Record<string, unknown> };
const projectDir = (name: string) => lw.at(name);
const playgroundJson = (name: string) =>
  JSON.parse(
    lw.fs.readText(absPath(join(projectDir(name), ".runyard", "playground.json"))) ?? "null",
  );

describe("创建时的模板展开", () => {
  it("把 files/ 复制进项目，playground.json 记下模板、运行器、运行环境、入口和创建时的版本", async () => {
    const pump = await setup();
    put(app("builtin", "tpl"), template("tpl"), { "src/App.tsx": "app\n" });
    const response = await create(pump, "tpl", "demo");
    expect(response.ok).toBe(true);
    expect(lw.fs.readText(absPath(join(projectDir("demo"), "src", "App.tsx")))).toBe("app\n");
    // template.json 本身不进项目（创建时只复制 files/）
    expect(lw.fs.exists(absPath(join(projectDir("demo"), "template.json")))).toBe(false);
    const file = playgroundJson("demo");
    expect(file).toMatchObject({
      template: { id: "tpl", source: "builtin", appVersion: "0.1.0" },
      runner: "node-server",
      requires: { node: ">=22.18 <27" },
      toolchainAtCreate: { node: "24.21.0" },
      entry: "src/main.ts",
    });
  });

  it("[TEMPLATES-FORMAT-02] 变量是字面替换：所列文件里的 {{title}} 原样换成值，未列出的文件不动", async () => {
    const pump = await setup();
    put(
      app("builtin", "tpl"),
      template("tpl", { variables: { title: "Untitled" }, substitute: ["src/App.tsx"] }),
      { "src/App.tsx": "<h1>{{title}}</h1> {{name}}\n", "src/other.txt": "{{title}}\n" },
    );
    const response = await create(pump, "tpl", "demo", { vars: { title: "A&B$1" } });
    expect(response.ok).toBe(true);
    const read = (path: string) =>
      lw.fs.readText(absPath(join(projectDir("demo"), ...path.split("/"))));
    // $1、& 不被当作替换串里的特殊写法；项目名由 {{name}} 代入
    expect(read("src/App.tsx")).toBe("<h1>A&B$1</h1> demo\n");
    expect(read("src/other.txt")).toBe("{{title}}\n");

    // 没给变量用默认值
    await create(pump, "tpl", "demo2");
    expect(lw.fs.readText(absPath(join(projectDir("demo2"), "src", "App.tsx")))).toBe(
      "<h1>Untitled</h1> demo2\n",
    );
  });

  it("[TEMPLATES-FORMAT-03] 没有钩子：叫 postcreate.sh 的文件只是普通文件，被复制、不被执行", async () => {
    const pump = await setup();
    put(app("builtin", "tpl"), template("tpl"), { "postcreate.sh": "echo hi\n" });
    const spawnedBefore = lw.world.fake.processes.spawned.length;
    expect((await create(pump, "tpl", "demo")).ok).toBe(true);
    expect(lw.fs.readText(absPath(join(projectDir("demo"), "postcreate.sh")))).toBe("echo hi\n");
    expect(lw.world.fake.processes.spawned.length).toBe(spawnedBefore);
  });

  it("[CLI-COMMANDS-29] 模板不存在：TEMPLATE_NOT_FOUND，没有创建文件夹；路径不能当模板标识", async () => {
    const pump = await setup();
    put(userDir("hello"), template("hello", { maintainer: undefined }));
    expect(await errorOf(create(pump, "nope", "demo"))).toMatchObject({
      code: "TEMPLATE_NOT_FOUND",
      params: { template: "nope" },
    });
    // 创建只认标识；lint 才收文件夹路径
    expect((await errorOf(create(pump, userDir("hello"), "demo"))).code).toBe("TEMPLATE_NOT_FOUND");
    expect(lw.fs.exists(projectDir("demo"))).toBe(false);
  });

  it("[CLI-COMMANDS-30] 没声明的变量和 name 都是 VAR_INVALID，没有创建文件夹", async () => {
    const pump = await setup();
    put(app("builtin", "tpl"), template("tpl", { variables: { title: "t" }, substitute: [] }));
    for (const key of ["color", "name"]) {
      expect(await errorOf(create(pump, "tpl", "demo", { vars: { [key]: "x" } }))).toMatchObject({
        code: "VAR_INVALID",
        params: { key },
      });
    }
    expect(lw.fs.exists(projectDir("demo"))).toBe(false);
  });

  it("[TEMPLATES-CUSTOM-19] 无效的模板不能用来创建：运行器不存在，TEMPLATE_INVALID，没有创建文件夹", async () => {
    const pump = await setup();
    put(userDir("broken"), template("broken", { runner: "no-such-runner", maintainer: undefined }));
    expect(await errorOf(create(pump, "broken", "demo"))).toMatchObject({
      code: "TEMPLATE_INVALID",
      params: { template: "broken" },
    });
    expect(lw.fs.exists(projectDir("demo"))).toBe(false);
  });

  it("[TEMPLATES-CUSTOM-02] 另存的模板立即可用：不重启，列表里有它，用它创建得到改过的文件", async () => {
    const pump = await setup();
    put(app("builtin", "react19"), template("react19"), { "src/App.tsx": "original\n" });
    expect((await create(pump, "react19", "pricing-table")).ok).toBe(true);
    lw.fs.writeFile(absPath(join(projectDir("pricing-table"), "src", "App.tsx")), "edited\n");

    await pump.result("template.save", {
      playground: "pricing-table",
      as: "my-pricing",
      name: "My pricing",
    });
    const templates = await pump.result<TemplateRecord[]>("template.list", {});
    expect(templates.find((record) => record.id === "my-pricing")).toMatchObject({
      source: "user",
      valid: true,
    });

    const copy = await create(pump, "my-pricing", "copy-1");
    expect(copy.ok).toBe(true);
    expect(lw.fs.readText(absPath(join(projectDir("copy-1"), "src", "App.tsx")))).toBe("edited\n");
    const file = playgroundJson("copy-1");
    expect(file.template).toMatchObject({ id: "my-pricing", source: "user" });
  });

  it("[TEMPLATES-CUSTOM-22] 手写了一个叫 react19 的模板：创建出来的是内置的，列表里用户的那个 valid 为 false", async () => {
    const pump = await setup();
    put(app("builtin", "react19"), template("react19"), { "src/App.tsx": "builtin\n" });
    put(userDir("react19"), template("react19", { maintainer: undefined }), {
      "src/App.tsx": "mine\n",
    });
    expect((await create(pump, "react19", "demo")).ok).toBe(true);
    expect(lw.fs.readText(absPath(join(projectDir("demo"), "src", "App.tsx")))).toBe("builtin\n");
    const file = playgroundJson("demo");
    expect(file.template.source).toBe("builtin");

    const records = (await pump.result<TemplateRecord[]>("template.list", {})).filter(
      (record) => record.id === "react19",
    );
    expect(records.map((record) => [record.source, record.valid])).toEqual([
      ["builtin", true],
      ["user", false],
    ]);
  });

  it("项目的种类取自模板的运行器：服务模板是 server，脚本模板是 oneshot", async () => {
    const pump = await setup();
    put(app("builtin", "srv"), template("srv"));
    put(app("builtin", "scr"), template("scr", { runner: "node-script" }));
    const kindOf = async (templateId: string, name: string) =>
      ((await create(pump, templateId, name)).result as { playground: { kind: string } }).playground
        .kind;
    expect(await kindOf("srv", "a")).toBe("server");
    expect(await kindOf("scr", "b")).toBe("oneshot");
  });

  it("创建时检测不到工具版本不挡创建：toolchainAtCreate 为空", async () => {
    const pump = await setup({});
    put(app("builtin", "tpl"), template("tpl"));
    expect((await create(pump, "tpl", "demo")).ok).toBe(true);
    const file = playgroundJson("demo");
    expect(file.toolchainAtCreate).toEqual({});
  });
});
