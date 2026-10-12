import { describe, expect, it } from "vitest";
import { readVersioned } from "./file-format.ts";
import { sampleToolDefinition } from "./sample-templates.ts";
import { toolDefinitionFileFormat, toolDefinitionSchema } from "./tool-definition.ts";
import { parseVersionRange } from "./version-range.ts";

type Raw = Record<string, unknown>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const tool = (patch: (definition: Raw) => void): Raw => {
  const definition = clone(sampleToolDefinition) as Raw;
  patch(definition);
  return definition;
};
const accepts = (raw: unknown) => toolDefinitionSchema.safeParse(raw).success;

describe("工具定义的格式", () => {
  it("样例（版本支持、检测脚本、macOS 安装方式）通过；版本支持的写法同 requires", () => {
    expect(accepts(sampleToolDefinition)).toBe(true);
    expect(parseVersionRange(sampleToolDefinition.supported).ok).toBe(true);
  });

  it("Go 的检测命令是 go version：args 写 [version]", () => {
    expect(
      accepts(
        tool((t) => {
          t.id = "go";
          t.detect = { args: ["version"], pattern: "go(\\d+\\.\\d+(?:\\.\\d+)?)" };
        }),
      ),
    ).toBe(true);
  });

  it("三部分缺一不可，多余的字段被拒绝", () => {
    for (const field of ["supported", "detect", "install", "id"])
      expect(
        accepts(
          tool((t) => {
            delete t[field];
          }),
        ),
      ).toBe(false);
    expect(
      accepts(
        tool((t) => {
          t.autoInstall = true;
        }),
      ),
    ).toBe(false);
  });

  it("官网链接必填且是 https；只给 macOS 一个系统", () => {
    const withInstall = (install: unknown) =>
      tool((t) => {
        t.install = install;
      });
    expect(accepts(withInstall({ darwin: {} }))).toBe(false);
    expect(accepts(withInstall({ darwin: { url: "http://nodejs.org" } }))).toBe(false);
    expect(accepts(withInstall({ darwin: { url: "https://nodejs.org" } }))).toBe(true);
    expect(accepts(withInstall({}))).toBe(false);
  });

  it("安装命令是参数数组，不是一行字符串", () => {
    expect(
      accepts(
        tool((t) => {
          t.install = {
            darwin: { url: "https://nodejs.org", homebrew: { command: "brew install node" } },
          };
        }),
      ),
    ).toBe(false);
  });

  it("可以按文件格式读取：版本比认识的新就只读不用", () => {
    expect(readVersioned(toolDefinitionFileFormat, sampleToolDefinition).status).toBe("ok");
    const newer = tool((t) => {
      t.formatVersion = 2;
    });
    expect(readVersioned(toolDefinitionFileFormat, newer).status).toBe("newer");
  });
});
