import { describe, expect, it } from "vitest";
import { CliError } from "./cli-error.ts";
import { builtinRegistry } from "./commands/declarations.ts";
import { globalOptions } from "./commands/global-options.ts";
import { globalsOf, parseLine, peekGlobals, resolveCommand } from "./parse-command-line.ts";

const run = builtinRegistry.commands.find((c) => c.name === "run");
const neu = builtinRegistry.commands.find((c) => c.name === "new");
if (run === undefined || neu === undefined) throw new Error("test setup: missing commands");

function resolved(args: string[]) {
  const r = resolveCommand(args, builtinRegistry);
  return r.kind === "command" ? r.command.name : r.kind;
}

describe("resolveCommand", () => {
  it("命令词可以在全局选项之后，--lang 的值不会被当成命令", () => {
    expect(resolved(["--json", "status"])).toBe("status");
    expect(resolved(["--lang", "zh-CN", "status"])).toBe("status");
    expect(resolved(["--root", "/x", "run", "demo"])).toBe("run");
  });

  it("有子命令的组要两个词；只有一个词是 group；没有词是 none；不认识的是 unknown", () => {
    expect(resolved(["config", "get", "lang"])).toBe("config get");
    expect(resolved(["template", "list"])).toBe("template list");
    expect(resolved(["config"])).toBe("group");
    expect(resolved(["--json"])).toBe("none");
    expect(resolved(["frob"])).toBe("unknown");
    expect(resolved(["config", "frob"])).toBe("unknown");
  });
});

describe("parseLine", () => {
  const specs = [...globalOptions, ...(neu?.options ?? [])];

  it("string 选项取下一个参数作为值，可以用 = 写，重复的选项按顺序保存", () => {
    const line = parseLine(
      ["new", "react19", "--note", "a b", "--var=x=1", "--var", "y=2", "--run"],
      specs,
      [0],
    );
    expect(line.positionals).toEqual(["react19"]);
    expect(line.options.get("note")).toEqual(["a b"]);
    expect(line.options.get("var")).toEqual(["x=1", "y=2"]);
    expect(line.options.get("run")).toEqual([true]);
  });

  it("-- 之后的内容都是位置参数", () => {
    const line = parseLine(["new", "react19", "--", "--json"], specs, [0]);
    expect(line.positionals).toEqual(["react19", "--json"]);
    expect(line.options.has("json")).toBe(false);
  });

  it("未知选项、缺值、布尔选项带值都抛 USAGE", () => {
    for (const args of [
      ["new", "--nope"],
      ["new", "--note"],
      ["new", "--json=1"],
    ]) {
      expect(() => parseLine(args, specs, [0]), args.join(" ")).toThrow(CliError);
    }
  });
});

describe("peekGlobals / globalsOf", () => {
  it("解析失败时也能读出全局选项", () => {
    expect(
      peekGlobals(["run", "--nope", "--json", "--quiet", "--lang", "zh-CN", "--root", "/r"]),
    ).toEqual({ json: true, quiet: true, help: false, root: "/r", lang: "zh-CN" });
  });

  it("globalsOf 取同名选项最后一次的值", () => {
    const line = parseLine(["status", "--lang", "en", "--lang", "zh-CN"], globalOptions, [0]);
    expect(globalsOf(line).lang).toBe("zh-CN");
  });
});
