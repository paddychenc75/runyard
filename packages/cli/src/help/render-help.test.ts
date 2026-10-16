import { afterEach, describe, expect, it } from "vitest";
import { Harness } from "../cli-harness.test.ts";
import { builtinRegistry } from "../commands/declarations.ts";
import { globalOptions } from "../commands/global-options.ts";

// --help 的快照（规格 CLI-COMMANDS-15）：每种语言一份文件，里面是根帮助、每个组和每条命令的帮助。
// 改了文案、命令或选项之后更新快照：
//   pnpm --filter runyard exec vitest run --project unit --update src/help
// 更新后读一遍 git diff，确认只有预期的变化。

const open: Harness[] = [];
afterEach(async () => {
  for (const h of open.splice(0)) await h.dispose();
});

const screens: string[][] = [
  [],
  ...builtinRegistry.groups.map((group) => [group.name]),
  ...builtinRegistry.commands.map((command) => command.name.split(" ")),
];

async function helpFor(lang: "en" | "zh-CN"): Promise<Map<string, string>> {
  const h = new Harness();
  open.push(h);
  const result = new Map<string, string>();
  for (const path of screens) {
    const run = await h.run(["--lang", lang, ...path, "--help"]);
    expect(run.code, path.join(" ")).toBe(0);
    expect(run.stderr, path.join(" ")).toBe("");
    result.set(`runyard ${path.join(" ")}`.trim(), run.stdout);
  }
  return result;
}

function asFile(help: Map<string, string>): string {
  return [...help].map(([name, text]) => `$ ${name} --help\n${text}`).join("\n");
}

describe("--help", () => {
  it("[CLI-COMMANDS-15] 英文帮助与快照一致", async () => {
    await expect(asFile(await helpFor("en"))).toMatchFileSnapshot("./__snapshots__/help.en.txt");
  });

  it("[CLI-COMMANDS-15] 中文帮助与快照一致", async () => {
    await expect(asFile(await helpFor("zh-CN"))).toMatchFileSnapshot(
      "./__snapshots__/help.zh-CN.txt",
    );
  });

  it("[CLI-COMMANDS-15] 命令名和选项名在两份里相同，没有被翻译", async () => {
    const english = await helpFor("en");
    const chinese = await helpFor("zh-CN");
    const names = (text: string) => text.match(/(?<![\w-])--[a-z][a-z-]*/g) ?? [];
    for (const [screen, text] of english) {
      expect(names(chinese.get(screen) ?? ""), screen).toEqual(names(text));
    }
    // 用法行（命令名、参数名、占位符）逐字相同
    const usage = (text: string) => text.split("\n").find((line) => line.startsWith("  runyard"));
    for (const [screen, text] of english) {
      expect(usage(chinese.get(screen) ?? ""), screen).toBe(usage(text));
    }
    expect(english.get("runyard run")).not.toBe(chinese.get("runyard run"));
  });

  it("每条命令的帮助列出它声明的全部选项和全局选项", async () => {
    const english = await helpFor("en");
    for (const command of builtinRegistry.commands) {
      const text = english.get(`runyard ${command.name}`) ?? "";
      for (const option of [...command.options, ...globalOptions]) {
        expect(text, command.name).toContain(`--${option.name}`);
      }
      for (const positional of command.positionals) {
        expect(text, command.name).toContain(positional.name);
      }
    }
  });

  it("-h 与 --help 相同；--help 在 --json 下仍是文字，退出码 0", async () => {
    const h = new Harness();
    open.push(h);
    const long = await h.run(["status", "--help"]);
    expect((await h.run(["status", "-h"])).stdout).toBe(long.stdout);
    const json = await h.run(["status", "--help", "--json"]);
    expect(json.stdout).toBe(long.stdout);
    expect(json.code).toBe(0);
  });

  it("没有命令的 --help 与根帮助相同；选项写在命令之前也认", async () => {
    const h = new Harness();
    open.push(h);
    const root = await h.run(["--help"]);
    expect((await h.run(["--lang", "en", "--help"])).stdout).toBe(root.stdout);
    expect((await h.run(["--lang", "en", "run", "--help"])).stdout).toBe(
      (await h.run(["run", "--help"])).stdout,
    );
  });

  it("未知命令的 --help 报 USAGE，不显示根帮助", async () => {
    const h = new Harness();
    open.push(h);
    const result = await h.run(["frobnicate", "--help"]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
  });
});
