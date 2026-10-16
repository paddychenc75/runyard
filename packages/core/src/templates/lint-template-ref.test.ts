import { join } from "node:path";
import { absPath } from "@runyard/platform";
import { createFakePlatform } from "@runyard/testing";
import { describe, expect, it } from "vitest";
import { lintTemplateRef } from "./lint-template-ref.ts";
import type { TemplateLocations } from "./locate-template.ts";

const runner = {
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
const nodeTool = {
  formatVersion: 1,
  id: "node",
  supported: ">=22 <27",
  detect: { args: ["--version"], pattern: "v(\\d+\\.\\d+\\.\\d+)" },
  install: { darwin: { url: "https://nodejs.org/en/download" } },
};
const files: Record<string, string> = {
  "src/main.ts": "export {};",
  "package.json": JSON.stringify({ dependencies: { react: "19.3.0" } }),
  "pnpm-workspace.yaml": "allowBuilds:\n  esbuild: true\n",
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
};
const template = (id: string, runnerId = "vite") => ({
  formatVersion: 1,
  id,
  name: { en: "Demo" },
  description: "Demo",
  category: "frontend",
  runner: runnerId,
  requires: { node: { version: ">=22.18 <27" } },
  entry: "src/main.ts",
  maintainer: "Runyard",
});

function setup() {
  const fake = createFakePlatform();
  const root = fake.platform.paths.home;
  const at = (...parts: string[]) => absPath(join(root, ...parts));
  const locations: TemplateLocations = {
    builtinDir: at("app", "builtin"),
    userDir: at("state", "templates"),
    runnersDir: at("app", "runners"),
    toolsDir: at("app", "tools"),
  };
  fake.fs.writeFile(at("app", "runners", "vite", "runner.json"), JSON.stringify(runner));
  fake.fs.writeFile(at("app", "tools", "node.json"), JSON.stringify(nodeTool));
  const put = (dir: string, json: unknown) => {
    fake.fs.writeFile(at(dir, "template.json"), JSON.stringify(json));
    for (const [path, text] of Object.entries(files))
      fake.fs.writeFile(at(dir, "files", path), text);
  };
  return { platform: fake.platform, fake, locations, at, put };
}

const rulesOf = (outcome: Awaited<ReturnType<typeof lintTemplateRef>>) =>
  outcome.kind === "linted" ? outcome.result.errors.map((e) => e.rule) : ["not-found"];

describe("lintTemplateRef", () => {
  it("按标识找到内置模板并检查", async () => {
    const { platform, locations, put } = setup();
    put("app/builtin/demo", { ...template("demo") });
    const outcome = await lintTemplateRef(platform, locations, "demo");
    expect(outcome).toMatchObject({ kind: "linted", result: { template: "demo", ok: true } });
  });

  it("标识和文件夹名不一致：template-json-invalid", async () => {
    const { platform, locations, put } = setup();
    put("state/templates/hello", template("hi"));
    const outcome = await lintTemplateRef(platform, locations, "hello");
    expect(rulesOf(outcome)).toContain("template-json-invalid");
  });

  it("用户模板自带的 runner.json 不会被当作运行器；指定的运行器不是内置的报 runner-not-found", async () => {
    const { platform, locations, put, fake, at } = setup();
    put("state/templates/mine", template("mine", "my-runner"));
    fake.fs.writeFile(
      at("state", "templates", "mine", "runner.json"),
      JSON.stringify({ ...runner, id: "my-runner" }),
    );
    expect(rulesOf(await lintTemplateRef(platform, locations, "mine"))).toContain(
      "runner-not-found",
    );
  });

  it("用户模板占用了内置标识：按路径检查它时报 template-id-reserved，按标识检查的是内置的", async () => {
    const { platform, locations, put, at } = setup();
    put("app/builtin/react19", template("react19"));
    put("state/templates/react19", template("react19"));
    const user = await lintTemplateRef(platform, locations, at("state", "templates", "react19"));
    expect(rulesOf(user)).toEqual(["template-id-reserved"]);
    const byId = await lintTemplateRef(platform, locations, "react19");
    expect(byId).toMatchObject({ kind: "linted", result: { ok: true } });
  });

  it("不在模板目录里的文件夹按路径照常检查；找不到 template.json 是 not-found", async () => {
    const { platform, locations, put, at } = setup();
    put("elsewhere/anything", template("demo"));
    expect(await lintTemplateRef(platform, locations, at("elsewhere", "anything"))).toMatchObject({
      kind: "linted",
      result: { ok: true },
    });
    expect(await lintTemplateRef(platform, locations, at("elsewhere", "nope"))).toEqual({
      kind: "not-found",
    });
    expect(await lintTemplateRef(platform, locations, "nope")).toEqual({ kind: "not-found" });
  });
});
