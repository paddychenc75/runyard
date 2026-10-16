import { joinPath, posixRelPath } from "@runyard/platform";
import { afterEach, describe, expect, it } from "vitest";
import { Harness } from "../cli-harness.test.ts";

const open: Harness[] = [];
function harness(): Harness {
  const h = new Harness();
  open.push(h);
  return h;
}
afterEach(async () => {
  for (const h of open.splice(0)) await h.dispose();
});

describe("config", () => {
  it("[CLI-COMMANDS-17] 设置并读取：set 返回 lang，get 返回 lang 和来源 saved，cli.json 里有 lang", async () => {
    const h = harness();
    const set = await h.run(["config", "set", "lang", "zh-CN", "--json"]);
    expect(h.json(set)).toEqual({ lang: "zh-CN" });
    const get = await h.run(["config", "get", "lang", "--json"]);
    expect(h.json(get)).toEqual({ lang: "zh-CN", source: "saved" });
    const file = JSON.parse((await h.platform.fs.readText(h.cliJson)) ?? "{}");
    expect(file).toEqual({ formatVersion: 1, lang: "zh-CN" });
  });

  it("[CLI-COMMANDS-18] 来源随优先级变化：环境变量盖过设置，参数盖过环境变量，都没有是 default", async () => {
    const h = harness();
    expect(h.json(await h.run(["config", "get", "lang", "--json"]))).toEqual({
      lang: "en",
      source: "default",
    });
    await h.run(["config", "set", "lang", "zh-CN"]);
    const env = await h.run(["config", "get", "lang", "--json"], { RUNYARD_LANG: "en" });
    expect(h.json(env)).toEqual({ lang: "en", source: "env" });
    const flag = await h.run(["config", "get", "lang", "--json", "--lang", "en"], {
      RUNYARD_LANG: "zh-CN",
    });
    expect(h.json(flag)).toEqual({ lang: "en", source: "flag" });
  });

  it("[CLI-COMMANDS-19] 非法的值和键都报 USAGE，退出码 2，cli.json 没有变化", async () => {
    const h = harness();
    await h.writeCliJson('{"formatVersion":1,"lang":"en"}');
    for (const args of [
      ["config", "set", "lang", "fr"],
      ["config", "set", "theme", "dark"],
      ["config", "get", "theme"],
      ["config", "set", "lang"],
    ]) {
      const result = await h.run([...args, "--json"]);
      expect((h.json(result).error as { code: string }).code, args.join(" ")).toBe("USAGE");
      expect(result.code, args.join(" ")).toBe(2);
    }
    expect(await h.platform.fs.readText(h.cliJson)).toBe('{"formatVersion":1,"lang":"en"}');
  });

  it("set 保留 cli.json 里的未知字段", async () => {
    const h = harness();
    await h.writeCliJson('{"formatVersion":1,"lang":"en","future":{"a":1}}');
    await h.run(["config", "set", "lang", "zh-CN"]);
    const file = JSON.parse((await h.platform.fs.readText(h.cliJson)) ?? "{}");
    expect(file).toEqual({ formatVersion: 1, lang: "zh-CN", future: { a: 1 } });
  });

  it("cli.json 来自更新版本时 set 报 DATA_FROM_NEWER_VERSION 且不改文件，get 仍可用", async () => {
    const h = harness();
    const text = '{"formatVersion":9,"lang":"zh-CN"}';
    await h.writeCliJson(text);
    const set = await h.run(["config", "set", "lang", "en", "--json"]);
    expect(h.json(set).error).toMatchObject({
      code: "DATA_FROM_NEWER_VERSION",
      data: { file: "cli.json", found: 9, supported: 1 },
    });
    expect(set.code).toBe(10);
    expect(await h.platform.fs.readText(h.cliJson)).toBe(text);
    expect(h.json(await h.run(["config", "get", "lang", "--json"]))).toEqual({
      lang: "en",
      source: "default",
    });
  });

  it("cli.json 损坏时 set 先把它改名留存，再写新文件；get 当作没有设置", async () => {
    const h = harness();
    await h.writeCliJson("{ not json");
    expect(h.json(await h.run(["config", "get", "lang", "--json"]))).toEqual({
      lang: "en",
      source: "default",
    });
    await h.run(["config", "set", "lang", "zh-CN"]);
    expect(await h.platform.fs.readText(h.cliJson)).toContain('"zh-CN"');
    const kept = joinPath(
      h.platform.paths.stateDir,
      posixRelPath("cli.json.corrupt-1760000000000"),
    );
    expect(h.fake.fs.exists(kept)).toBe(true);
  });

  it("config 在文本模式下也能用，且不连管理进程", async () => {
    const h = harness();
    const set = await h.run(["config", "set", "lang", "zh-CN"]);
    expect(set.code).toBe(0);
    expect(set.stdout).not.toBe("");
    expect(set.stderr).toBe("");
    expect(h.connectCalls).toHaveLength(0);
  });
});
