import { describe, expect, it } from "vitest";
import { Harness } from "../cli-harness.test.ts";

const VERSION = "0.2.0";

function setup(): Harness {
  // connect 默认调用即失败：证明版本命令没有连管理进程
  return new Harness({
    host: { install: { kind: "app", version: VERSION, path: "/Applications/Runyard.app/runyard" } },
  });
}

describe("version", () => {
  it("[CLI-COMMANDS-85] --version、-v、version 都只输出一行版本号，退出码 0，没有连管理进程", async () => {
    for (const args of [["--version"], ["-v"], ["version"]]) {
      const h = setup();
      const result = await h.run(args);
      expect(result, args.join(" ")).toEqual({ code: 0, stdout: `${VERSION}\n`, stderr: "" });
      expect(h.connectCalls).toHaveLength(0);
    }
  });

  it("[CLI-COMMANDS-85] 中文下也是同一行；跟在命令后面的 --version 同样只报版本", async () => {
    const h = setup();
    expect((await h.run(["--lang", "zh-CN", "version"])).stdout).toBe(`${VERSION}\n`);
    expect((await h.run(["status", "--version"])).stdout).toBe(`${VERSION}\n`);
  });

  it("[CLI-COMMANDS-86] --json 只有 version 字段，两种语言逐字相同", async () => {
    const h = setup();
    const en = await h.run(["--version", "--json", "--lang", "en"]);
    const zh = await h.run(["--version", "--json", "--lang", "zh-CN"]);
    expect(h.json(en)).toEqual({ version: VERSION });
    expect(zh.stdout).toBe(en.stdout);
    expect((await h.run(["version", "--json"])).stdout).toBe(en.stdout);
  });
});
