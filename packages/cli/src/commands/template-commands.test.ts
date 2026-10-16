import { join } from "node:path";
import type { RunyardClient } from "@runyard/client";
import { clientError } from "@runyard/client";
import { absPath } from "@runyard/platform";
import type { TemplateRecord } from "@runyard/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { Harness } from "../cli-harness.test.ts";

const open: Harness[] = [];
type Calls = { method: string; params: unknown }[];

function harness(handlers: Record<string, (params: never) => unknown> = {}): {
  h: Harness;
  calls: Calls;
} {
  const calls: Calls = [];
  const client = {
    call: async (method: string, params: unknown) => {
      calls.push({ method, params });
      const handler = handlers[method];
      if (handler === undefined) throw new Error(`unexpected call ${method}`);
      return handler(params as never);
    },
    close: () => undefined,
  } as unknown as RunyardClient;
  const h = new Harness({ connect: async () => client });
  open.push(h);
  return { h, calls };
}
afterEach(async () => {
  for (const h of open.splice(0)) await h.dispose();
});

const record = (id: string, name: TemplateRecord["name"]): TemplateRecord => ({
  id,
  name,
  description: "d",
  category: "frontend",
  tags: [],
  source: "builtin",
  runner: "vite",
  kind: "server",
  requires: {},
  valid: true,
});

describe("template list / show", () => {
  it("[CLI-COMMANDS-69] 名称原样带着模板里的值，两种语言下 --json 逐字相同", async () => {
    const templates = [
      record("react19", { en: "React 19", "zh-CN": "React 19 示例" }),
      record("html", "HTML"),
    ];
    const { h } = harness({ "template.list": () => templates });
    const en = await h.run(["template", "list", "--json", "--lang", "en"]);
    const zh = await h.run(["template", "list", "--json", "--lang", "zh-CN"]);
    expect(en.stdout).toBe(zh.stdout);
    expect(h.json(en).templates).toEqual(templates);
  });

  it("list 的文字输出按当前语言挑名称", async () => {
    const { h } = harness({
      "template.list": () => [record("react19", { en: "React 19", "zh-CN": "React 19 示例" })],
    });
    expect((await h.run(["template", "list", "--lang", "zh-CN"])).stdout).toContain(
      "React 19 示例",
    );
    expect((await h.run(["template", "list", "--lang", "en"])).stdout).toContain("React 19");
  });

  it("[CLI-COMMANDS-71] 不存在的模板：TEMPLATE_NOT_FOUND，退出码 3", async () => {
    const { h } = harness({
      "template.get": () => {
        throw clientError("TEMPLATE_NOT_FOUND", { template: "nope" }, "no such template");
      },
    });
    const result = await h.run(["template", "show", "nope", "--json"]);
    expect(h.json(result).error).toMatchObject({
      code: "TEMPLATE_NOT_FOUND",
      data: { template: "nope" },
    });
    expect(result.code).toBe(3);
  });

  it("show 把管理进程给的模板、位置和文件列表放进结果", async () => {
    const detail = {
      template: record("html", "HTML"),
      path: "/app/builtin/html",
      files: ["index.html"],
    };
    const { h, calls } = harness({ "template.get": () => detail });
    const result = await h.run(["template", "show", "html", "--json"]);
    expect(h.json(result)).toEqual(detail);
    expect(calls).toEqual([{ method: "template.get", params: { id: "html" } }]);
  });
});

describe("template save", () => {
  const saved = {
    id: "my-pricing",
    name: "My pricing",
    path: "/state/templates/my-pricing",
    files: ["src/App.tsx"],
    source: "user",
  };

  it("把选项原样交给管理进程，结果是 id、name、path、files、source", async () => {
    const { h, calls } = harness({ "template.save": () => saved });
    const result = await h.run([
      "template",
      "save",
      "pricing-table",
      "--as",
      "my-pricing",
      "--name",
      "My pricing",
      "--description",
      "d",
      "--replace-name",
      "--include",
      ".env",
      "--include",
      "dist/x.js",
      "--exclude",
      "src/secret.ts",
      "--json",
    ]);
    expect(h.json(result)).toEqual(saved);
    expect(calls).toEqual([
      {
        method: "template.save",
        params: {
          playground: "pricing-table",
          as: "my-pricing",
          name: "My pricing",
          description: "d",
          replaceName: true,
          include: [".env", "dist/x.js"],
          exclude: ["src/secret.ts"],
        },
      },
    ]);
  });

  it("不给可选项时请求里没有这些键", async () => {
    const { h, calls } = harness({ "template.save": () => saved });
    await h.run(["template", "save", "pricing-table", "--as", "my-pricing"]);
    expect(calls[0]?.params).toEqual({ playground: "pricing-table", as: "my-pricing" });
  });

  it("[TEMPLATES-CUSTOM-03] 标识写法不对：NAME_INVALID，退出码 2，没有发请求", async () => {
    const { h, calls } = harness({ "template.save": () => saved });
    for (const id of ["My_Template", "a-"]) {
      const result = await h.run(["template", "save", "pricing-table", "--as", id, "--json"]);
      expect((h.json(result).error as { code: string }).code, id).toBe("NAME_INVALID");
      expect(result.code, id).toBe(2);
    }
    const leading = await h.run(["template", "save", "pricing-table", "--as=-a", "--json"]);
    expect((h.json(leading).error as { code: string }).code).toBe("NAME_INVALID");
    expect(calls).toEqual([]);
  });

  it("[TEMPLATES-CUSTOM-13] 不合法的路径：USAGE，退出码 2，没有发请求", async () => {
    const { h, calls } = harness({ "template.save": () => saved });
    for (const args of [
      ["--include", "../outside"],
      ["--exclude", "/etc/passwd"],
    ]) {
      const result = await h.run(["template", "save", "pg", "--as", "ok", ...args, "--json"]);
      expect((h.json(result).error as { code: string }).code, args.join(" ")).toBe("USAGE");
      expect(result.code).toBe(2);
    }
    expect(calls).toEqual([]);
  });

  it("[TEMPLATES-CUSTOM-04] 标识被占用：管理进程的 NAME_EXISTS 原样变成退出码 9", async () => {
    const { h } = harness({
      "template.save": () => {
        throw clientError("NAME_EXISTS", { name: "react19" }, "taken");
      },
    });
    const result = await h.run(["template", "save", "pg", "--as", "react19", "--json"]);
    expect(result.code).toBe(9);
    expect(h.json(result).error).toMatchObject({ code: "NAME_EXISTS" });
  });

  it("项目不存在、文件夹找不到：退出码 3", async () => {
    for (const code of ["PLAYGROUND_NOT_FOUND", "FOLDER_MISSING"] as const) {
      const { h } = harness({
        "template.save": () => {
          throw clientError(code, { name: "pg" }, "missing");
        },
      });
      const result = await h.run(["template", "save", "pg", "--as", "ok", "--json"]);
      expect(h.json(result).error).toMatchObject({ code });
      expect(result.code).toBe(3);
    }
  });

  it("缺 --as 报 USAGE", async () => {
    const { h } = harness();
    const result = await h.run(["template", "save", "pg", "--json"]);
    expect((h.json(result).error as { code: string }).code).toBe("USAGE");
  });
});

describe("template lint", () => {
  const runner = {
    formatVersion: 1,
    id: "static",
    kind: "server",
    needs: [],
    run: { command: ["node", "serve.js", "--port", "{port}", "--host", "127.0.0.1"] },
    ready: { http: { path: "/" } },
    preview: { type: "web" },
    watch: { mode: "none" },
    stop: { mode: "graceful" },
  };
  const template = (overrides: Record<string, unknown> = {}) => ({
    formatVersion: 1,
    id: "demo",
    name: { en: "Demo" },
    description: "Demo",
    category: "page",
    runner: "static",
    requires: {},
    entry: "index.html",
    maintainer: "Runyard",
    ...overrides,
  });

  function setup() {
    const { h } = harness();
    const { builtinDir, runnersDir } = h.appData;
    h.fake.fs.writeFile(absPath(join(runnersDir, "static", "runner.json")), JSON.stringify(runner));
    const put = (dir: string, json: unknown) => {
      h.fake.fs.writeFile(absPath(join(dir, "template.json")), JSON.stringify(json));
      h.fake.fs.writeFile(absPath(join(dir, "files", "index.html")), "<html></html>");
    };
    return { h, put, builtinDir };
  }

  it("[CLI-COMMANDS-72] 不连管理进程：lint 成功，没有尝试连接", async () => {
    const { h, put, builtinDir } = setup();
    put(join(builtinDir, "demo"), template());
    const result = await h.run(["template", "lint", "demo", "--json"]);
    expect(result.code).toBe(0);
    expect(h.json(result)).toEqual({ template: "demo", ok: true, errors: [], warnings: [] });
    expect(h.connectCalls).toEqual([]);
  });

  it("[TEMPLATES-FORMAT-42] 不在模板目录里的文件夹按绝对路径照常检查；文件夹不存在报 TEMPLATE_NOT_FOUND，退出码 3", async () => {
    const { h, put } = setup();
    const elsewhere = join(h.platform.paths.home, "elsewhere", "anything");
    put(elsewhere, template());
    const ok = await h.run(["template", "lint", elsewhere, "--json"]);
    expect(h.json(ok)).toMatchObject({ template: "demo", ok: true });
    const missing = await h.run([
      "template",
      "lint",
      join(h.platform.paths.home, "nope"),
      "--json",
    ]);
    expect(missing.code).toBe(3);
    expect(h.json(missing).error).toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
  });

  it("有错误时结果对象照常输出，ok 为 false，退出码 2", async () => {
    const { h, put, builtinDir } = setup();
    put(join(builtinDir, "broken"), template({ id: "broken", runner: "missing" }));
    const result = await h.run(["template", "lint", "broken", "--json"]);
    expect(result.code).toBe(2);
    const body = h.json(result) as { ok: boolean; errors: { rule: string }[] };
    expect(body.ok).toBe(false);
    expect(body.errors.map((e) => e.rule)).toContain("runner-not-found");
  });

  it("标识和文件夹名不一致：lint 报 template-json-invalid", async () => {
    const { h, put } = setup();
    put(join(h.platform.paths.stateDir, "templates", "hello"), template({ id: "hi" }));
    const result = await h.run(["template", "lint", "hello", "--json"]);
    const body = h.json(result) as { errors: { rule: string }[] };
    expect(body.errors.map((e) => e.rule)).toContain("template-json-invalid");
  });

  it("用户模板自带的 runner.json 不会被当作运行器", async () => {
    const { h, put } = setup();
    const dir = join(h.platform.paths.stateDir, "templates", "mine");
    put(dir, template({ id: "mine", runner: "my-own" }));
    h.fake.fs.writeFile(
      absPath(join(dir, "runner.json")),
      JSON.stringify({ ...runner, id: "my-own" }),
    );
    const result = await h.run(["template", "lint", "mine", "--json"]);
    const body = h.json(result) as { errors: { rule: string }[] };
    expect(body.errors.map((e) => e.rule)).toContain("runner-not-found");
  });

  it("用户模板占用了内置标识：按路径检查它时报 template-id-reserved", async () => {
    const { h, put, builtinDir } = setup();
    put(join(builtinDir, "react19"), template({ id: "react19" }));
    const dir = join(h.platform.paths.stateDir, "templates", "react19");
    put(dir, template({ id: "react19" }));
    const result = await h.run(["template", "lint", dir, "--json"]);
    const body = h.json(result) as { errors: { rule: string }[] };
    expect(body.errors.map((e) => e.rule)).toEqual(["template-id-reserved"]);
  });
});
