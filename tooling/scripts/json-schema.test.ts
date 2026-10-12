import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as protocol from "../../packages/protocol/src/index.ts";
import {
  samplePythonRunner,
  sampleStaticRunner,
  sampleTemplate,
  sampleToolDefinition,
  sampleViteRunner,
} from "../../packages/protocol/src/sample-templates.ts";
import { jsonSchemas, renderJsonSchema } from "./generate.ts";

// 往返：zod 生成 JSON Schema，再把 JSON Schema 变回校验器，两边对同一批样例的结论必须一致。
// 样例只放“形状”上的对错：zod 里的 refine（相对路径不含 ..、正则合法、至少一个变体）
// JSON Schema 写不出来，所以那类规则由 validateTemplate / validateRunner 把关，不在这里比。

const root = join(import.meta.dirname, "..", "..");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Raw = Record<string, unknown>;
const edit = (base: unknown, patch: (value: Raw) => void): Raw => {
  const value = clone(base) as Raw;
  patch(value);
  return value;
};

interface Case {
  file: string;
  schema: z.ZodType;
  valid: Record<string, unknown>;
  invalid: Record<string, unknown>;
}

const cases: Case[] = [
  {
    file: "templates/schema/runner.schema.json",
    schema: protocol.runnerSchema,
    valid: {
      vite: sampleViteRunner,
      python: samplePythonRunner,
      static: sampleStaticRunner,
      "保留字段 detect 和 actions": edit(sampleViteRunner, (r) => {
        r.detect = { any: 1 };
        r.actions = [];
      }),
      "graceMs 省略（缺省 2000）": edit(sampleViteRunner, (r) => {
        r.stop = { mode: "interrupt" };
      }),
      "ready 用 log": edit(sampleViteRunner, (r) => {
        r.ready = { log: { match: "ready" } };
      }),
    },
    invalid: {
      缺少kind: edit(sampleViteRunner, (r) => {
        delete r.kind;
      }),
      未知的kind: edit(sampleViteRunner, (r) => {
        r.kind = "daemon";
      }),
      命令是一整行字符串: edit(sampleViteRunner, (r) => {
        (r.run as Raw).command = "node server.js";
      }),
      stop的mode是信号名: edit(sampleViteRunner, (r) => {
        r.stop = { mode: "SIGTERM" };
      }),
      stop里多出signal: edit(sampleViteRunner, (r) => {
        r.stop = { mode: "graceful", signal: "SIGTERM" };
      }),
      graceMs为负: edit(sampleViteRunner, (r) => {
        r.stop = { mode: "graceful", graceMs: -1 };
      }),
      graceMs不是整数: edit(sampleViteRunner, (r) => {
        r.stop = { mode: "graceful", graceMs: 1.5 };
      }),
      原因不认识: edit(sampleViteRunner, (r) => {
        (r.setup as { errors: unknown[] }).errors = [{ match: "x", reason: "SOMETHING_ELSE" }];
      }),
      预览类型不认识: edit(sampleViteRunner, (r) => {
        r.preview = { type: "terminal" };
      }),
      watch模式不认识: edit(sampleViteRunner, (r) => {
        r.watch = { mode: "poll" };
      }),
      多余的字段: edit(sampleViteRunner, (r) => {
        r.hooks = [];
      }),
      formatVersion不是1: edit(sampleViteRunner, (r) => {
        r.formatVersion = 2;
      }),
      空命令: edit(sampleViteRunner, (r) => {
        (r.run as Raw).command = [];
      }),
    },
  },
  {
    file: "templates/schema/template.schema.json",
    schema: protocol.templateSchema,
    valid: {
      样例: sampleTemplate,
      名称是纯字符串: edit(sampleTemplate, (t) => {
        t.name = "React";
      }),
      "requires 是空对象": edit(sampleTemplate, (t) => {
        t.requires = {};
      }),
      带标签: edit(sampleTemplate, (t) => {
        t.tags = ["unmaintained"];
      }),
    },
    invalid: {
      缺runner: edit(sampleTemplate, (t) => {
        delete t.runner;
      }),
      缺requires: edit(sampleTemplate, (t) => {
        delete t.requires;
      }),
      标识含大写和下划线: edit(sampleTemplate, (t) => {
        t.id = "My_Template";
      }),
      标识以连字符结尾: edit(sampleTemplate, (t) => {
        t.id = "a-";
      }),
      名称缺英文: edit(sampleTemplate, (t) => {
        t.name = { "zh-CN": "静态页面" };
      }),
      分类不认识: edit(sampleTemplate, (t) => {
        t.category = "games";
      }),
      标签不认识: edit(sampleTemplate, (t) => {
        t.tags = ["hot"];
      }),
      版本范围缺version: edit(sampleTemplate, (t) => {
        t.requires = { node: {} };
      }),
      多余的字段: edit(sampleTemplate, (t) => {
        t.hooks = ["postcreate.sh"];
      }),
      formatVersion不是1: edit(sampleTemplate, (t) => {
        t.formatVersion = 2;
      }),
      "entry 里有反斜杠": edit(sampleTemplate, (t) => {
        t.entry = "src\\App.tsx";
      }),
    },
  },
  {
    file: "templates/schema/tool.schema.json",
    schema: protocol.toolDefinitionSchema,
    valid: {
      样例: sampleToolDefinition,
      Go的检测命令: edit(sampleToolDefinition, (t) => {
        t.detect = { args: ["version"], pattern: "go(\\d+\\.\\d+)" };
      }),
    },
    invalid: {
      缺检测脚本: edit(sampleToolDefinition, (t) => {
        delete t.detect;
      }),
      缺安装方式: edit(sampleToolDefinition, (t) => {
        delete t.install;
      }),
      官网链接不是https: edit(sampleToolDefinition, (t) => {
        t.install = { darwin: { url: "http://example.com" } };
      }),
      安装命令是字符串: edit(sampleToolDefinition, (t) => {
        t.install = { darwin: { url: "https://example.com", homebrew: { command: "brew" } } };
      }),
      多余的字段: edit(sampleToolDefinition, (t) => {
        t.autoInstall = true;
      }),
    },
  },
];

describe("templates/schema 下的 JSON Schema 与 zod 一致", () => {
  it("三个文件都登记在生成表里，没有多余的", () => {
    expect(Object.keys(jsonSchemas).sort()).toEqual(cases.map((c) => c.file).sort());
  });

  it.each(cases)("$file 提交的内容就是由 zod 生成的内容", ({ file, schema }) => {
    const committed = readFileSync(join(root, file), "utf8");
    expect(committed).toBe(renderJsonSchema(schema));
    expect(JSON.parse(committed).$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it.each(cases)(
    "$file 往返：JSON Schema 与 zod 对每个样例的结论一致",
    ({ file, schema, valid, invalid }) => {
      const fromJson = z.fromJSONSchema(JSON.parse(readFileSync(join(root, file), "utf8")));
      for (const [name, sample] of Object.entries(valid)) {
        expect(schema.safeParse(sample).success, `zod 应接受：${name}`).toBe(true);
        expect(fromJson.safeParse(sample).success, `JSON Schema 应接受：${name}`).toBe(true);
      }
      for (const [name, sample] of Object.entries(invalid)) {
        expect(schema.safeParse(sample).success, `zod 应拒绝：${name}`).toBe(false);
        expect(fromJson.safeParse(sample).success, `JSON Schema 应拒绝：${name}`).toBe(false);
      }
    },
  );

  it("写模板的人看到的是 input 一侧：带默认值的字段不是必填", () => {
    const runner = JSON.parse(
      readFileSync(join(root, "templates/schema/runner.schema.json"), "utf8"),
    );
    expect(runner.properties.stop.required).toEqual(["mode"]);
    expect(runner.properties.stop.properties.graceMs.default).toBe(2000);
  });

  it("zod 改了而没重新生成：生成物就和提交的不同（generated-fresh 靠这个变红）", () => {
    const changed = protocol.runnerSchema.extend({ extra: z.string() });
    expect(renderJsonSchema(changed)).not.toBe(
      readFileSync(join(root, "templates/schema/runner.schema.json"), "utf8"),
    );
  });
});
