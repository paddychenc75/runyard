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

describe("rm", () => {
  it("[CLI-COMMANDS-60] 正在运行的项目：运行已停止，结果含名称、绝对路径和 trashed，资源库里没有它", async () => {
    const fake = new FakeSupervisor({ playgrounds: [playground("demo")], runs: [run("demo")] });
    const h = setup(fake);
    const result = await h.run(["rm", "demo", "--json"]);
    expect(result.code).toBe(0);
    expect(h.json(result)).toEqual({
      name: "demo",
      path: "/fake-home/Runyard/demo",
      trashed: true,
    });
    expect(fake.runs[0]?.state).toBe("stopped");
    expect(fake.playgrounds).toEqual([]);
    expect(fake.trashed).toEqual(["/fake-home/Runyard/demo"]);
    // 只经 playground.trash，没有别的删除途径
    expect(fake.calls.map((c) => c.method)).toEqual(["playground.get", "playground.trash"]);
  });

  it("[CLI-COMMANDS-61] 放不进废纸篓：TRASH_UNAVAILABLE、退出码 9，项目仍在资源库里", async () => {
    const fake = new FakeSupervisor({
      playgrounds: [playground("demo")],
      trashFails: "TRASH_UNAVAILABLE",
    });
    const h = setup(fake);
    const result = await h.run(["rm", "demo", "--json"]);
    expect(result.code).toBe(9);
    expect(h.json(result).error).toMatchObject({
      code: "TRASH_UNAVAILABLE",
      data: { name: "demo" },
    });
    expect(fake.playgrounds).toHaveLength(1);
    expect(fake.trashed).toEqual([]);
  });

  it("文件夹被占用：PATH_LOCKED、退出码 9，项目原样保留", async () => {
    const fake = new FakeSupervisor({
      playgrounds: [playground("demo")],
      trashFails: "PATH_LOCKED",
    });
    const h = setup(fake);
    const result = await h.run(["rm", "demo", "--json"]);
    expect(result.code).toBe(9);
    expect(h.json(result).error).toMatchObject({ code: "PATH_LOCKED" });
    expect(fake.playgrounds).toHaveLength(1);
  });

  it("[CLI-COMMANDS-62] 不存在的项目：PLAYGROUND_NOT_FOUND、退出码 3", async () => {
    const h = setup(new FakeSupervisor());
    const result = await h.run(["rm", "nope", "--json"]);
    expect(result.code).toBe(3);
    expect(h.json(result).error).toMatchObject({
      code: "PLAYGROUND_NOT_FOUND",
      data: { name: "nope" },
    });
  });

  it("文字输出写“移到废纸篓”，不提问", async () => {
    const fake = new FakeSupervisor({ playgrounds: [playground("demo")] });
    const h = setup(fake);
    const zh = await h.run(["rm", "demo", "--lang", "zh-CN"]);
    expect(zh.stdout).toContain("移到");
    expect(zh.stdout).toContain("废纸篓");
    expect(zh.code).toBe(0);
  });
});
