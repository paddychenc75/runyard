import { afterEach, describe, expect, it } from "vitest";
import { Harness } from "../cli-harness.test.ts";
import { FakeSupervisor, playground, run } from "./fake-supervisor.test.ts";

const open: Harness[] = [];
afterEach(async () => {
  for (const h of open.splice(0)) await h.dispose();
});

function setup(fake: FakeSupervisor): Harness {
  const h = new Harness({ connect: async () => fake.client });
  open.push(h);
  return h;
}

describe("stop", () => {
  it("[CLI-COMMANDS-47] 停止一个项目：结果列出 runId 和名称，运行已停", async () => {
    const fake = new FakeSupervisor({ playgrounds: [playground("demo")], runs: [run("demo")] });
    const h = setup(fake);
    const result = await h.run(["stop", "demo", "--json"]);
    expect(result.code).toBe(0);
    expect(h.json(result)).toEqual({ stopped: [{ runId: "run-demo", name: "demo" }] });
    expect(fake.runs[0]?.state).toBe("stopped");
  });

  it("[CLI-COMMANDS-48] 没有运行也成功：项目从没运行过，或运行早已结束，都返回空数组", async () => {
    const fake = new FakeSupervisor({
      playgrounds: [playground("never"), playground("done")],
      runs: [run("done", { state: "finished" })],
    });
    const h = setup(fake);
    for (const name of ["never", "done"]) {
      const result = await h.run(["stop", name, "--json"]);
      expect(result.code).toBe(0);
      expect(h.json(result)).toEqual({ stopped: [] });
    }
  });

  it("[CLI-COMMANDS-49] stop --all --mine 只停命令行持有的，标签页持有的仍在运行", async () => {
    const tab = { kind: "tab", clientId: "c1", tabId: "t1" } as const;
    const fake = new FakeSupervisor({
      playgrounds: [playground("a"), playground("b"), playground("c")],
      runs: [run("a"), run("b"), run("c", { owner: tab })],
    });
    const h = setup(fake);
    const result = await h.run(["stop", "--all", "--mine", "--json"]);
    expect(h.json(result)).toEqual({
      stopped: [
        { runId: "run-a", name: "a" },
        { runId: "run-b", name: "b" },
      ],
    });
    expect(fake.runs.map((r) => r.state)).toEqual(["stopped", "stopped", "ready"]);
    expect(fake.calls).toContainEqual({ method: "run.stopAll", params: { mine: true } });
  });

  it("stop --all 不带 --mine 停掉全部，包括标签页持有的", async () => {
    const tab = { kind: "tab", clientId: "c1", tabId: "t1" } as const;
    const fake = new FakeSupervisor({
      playgrounds: [playground("a"), playground("c")],
      runs: [run("a"), run("c", { owner: tab })],
    });
    const h = setup(fake);
    const result = await h.run(["stop", "--all", "--json"]);
    expect(h.json(result).stopped).toHaveLength(2);
    expect(fake.calls).toContainEqual({ method: "run.stopAll", params: {} });
  });

  it("[CLI-COMMANDS-50] 参数组合不对：USAGE、退出码 2，没有连管理进程、没有停任何运行", async () => {
    const fake = new FakeSupervisor({ playgrounds: [playground("demo")], runs: [run("demo")] });
    const h = setup(fake);
    for (const args of [
      ["stop"],
      ["stop", "demo", "--all"],
      ["stop", "--mine"],
      ["stop", "demo", "--mine"],
    ]) {
      const result = await h.run([...args, "--json"]);
      expect(result.code).toBe(2);
      expect((h.json(result).error as { code: string }).code).toBe("USAGE");
    }
    expect(h.connectCalls).toHaveLength(0);
    expect(fake.runs[0]?.state).toBe("ready");
  });

  it("不存在的项目：PLAYGROUND_NOT_FOUND，退出码 3", async () => {
    const h = setup(new FakeSupervisor());
    const result = await h.run(["stop", "nope", "--json"]);
    expect(result.code).toBe(3);
    expect(h.json(result).error).toMatchObject({ code: "PLAYGROUND_NOT_FOUND" });
  });

  it("文字输出：两种语言都有一行说明，--json 不随语言变", async () => {
    const make = () =>
      new FakeSupervisor({ playgrounds: [playground("demo")], runs: [run("demo")] });
    const en = await setup(make()).run(["stop", "demo", "--lang", "en"]);
    const zh = await setup(make()).run(["stop", "demo", "--lang", "zh-CN"]);
    expect(en.stdout).toContain("Stopped demo");
    expect(zh.stdout).toContain("已停止 demo");
    const jsonEn = await setup(make()).run(["stop", "demo", "--json", "--lang", "en"]);
    const jsonZh = await setup(make()).run(["stop", "demo", "--json", "--lang", "zh-CN"]);
    expect(jsonEn.stdout).toBe(jsonZh.stdout);
  });
});
