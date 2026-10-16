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

type Row = Record<string, unknown>;
const rowsOf = (h: Harness, result: Parameters<Harness["json"]>[0]) =>
  h.json(result).playgrounds as Row[];

const ROW_KEYS = [
  "id",
  "name",
  "path",
  "template",
  "kind",
  "state",
  "url",
  "port",
  "owner",
  "agent",
  "idleStopAt",
  "retention",
  "cleanInDays",
  "note",
  "createdBy",
  "lastUsedAt",
  "missing",
].sort();

describe("status", () => {
  it("[CLI-COMMANDS-51] 命令行创建、ready 的服务：全部键都在，owner、idleStopAt、retention、missing 的值", async () => {
    const fake = new FakeSupervisor({
      playgrounds: [
        playground("demo", { note: "n", createdBy: { kind: "agent", agent: "Claude Code" } }),
      ],
      runs: [
        run("demo", {
          owner: { kind: "cli", agent: "Claude Code", command: "runyard run demo" },
          idleStopAt: 1_760_001_800_000,
        }),
      ],
    });
    const h = setup(fake);
    const result = await h.run(["status", "--json"]);
    expect(result.code).toBe(0);
    const json = h.json(result);
    expect(json.running).toBe(1);
    const [row] = rowsOf(h, result);
    expect(Object.keys(row ?? {}).sort()).toEqual(ROW_KEYS);
    expect(row).toMatchObject({
      name: "demo",
      template: "html",
      state: "ready",
      owner: "cli",
      agent: "Claude Code",
      idleStopAt: 1_760_001_800_000,
      retention: "kept",
      cleanInDays: null,
      note: "n",
      createdBy: { kind: "agent", agent: "Claude Code" },
      missing: false,
    });
  });

  it("[CLI-COMMANDS-52] 从没运行过的自动清理项目：stopped，owner、url 为 null，autoClean 距到期 30 天；给 <pg> 只列这一个", async () => {
    const h0 = new Harness();
    const now = h0.fake.clock.now();
    await h0.dispose();
    const fake = new FakeSupervisor({
      playgrounds: [
        playground("fresh", { autoClean: { enabled: true, days: 30 }, lastUsedAt: now }),
        playground("other"),
      ],
    });
    const h = setup(fake);
    const result = await h.run(["status", "fresh", "--json"]);
    const rows = rowsOf(h, result);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "fresh",
      state: "stopped",
      owner: null,
      agent: null,
      url: null,
      port: null,
      idleStopAt: null,
      retention: "autoClean",
      cleanInDays: 30,
    });
  });

  it("[CLI-COMMANDS-53] --running 只列有活动运行的项目，running 仍是总数", async () => {
    const fake = new FakeSupervisor({
      playgrounds: [playground("up"), playground("down")],
      runs: [run("up")],
    });
    const h = setup(fake);
    const result = await h.run(["status", "--running", "--json"]);
    expect(rowsOf(h, result).map((r) => r.name)).toEqual(["up"]);
    expect(h.json(result).running).toBe(1);
  });

  it("[CLI-COMMANDS-54] 找不到文件夹的项目：命令成功，missing 为 true", async () => {
    const fake = new FakeSupervisor({
      playgrounds: [playground("gone", { missingSince: 5 })],
    });
    const h = setup(fake);
    const result = await h.run(["status", "--json"]);
    expect(result.code).toBe(0);
    expect(rowsOf(h, result)[0]).toMatchObject({ name: "gone", missing: true, state: "stopped" });
  });

  it("[CLI-COMMANDS-04] 所有 path 以 / 开头，所有 url 以 http://127.0.0.1: 开头，没有 localhost", async () => {
    const fake = new FakeSupervisor({
      playgrounds: [playground("demo"), playground("idle")],
      runs: [run("demo")],
    });
    const h = setup(fake);
    const result = await h.run(["status", "--json"]);
    const rows = rowsOf(h, result);
    for (const row of rows) expect(String(row.path).startsWith("/")).toBe(true);
    const urls = rows.map((r) => r.url).filter((u) => u !== null);
    expect(urls).toHaveLength(1);
    for (const url of urls) expect(String(url).startsWith("http://127.0.0.1:")).toBe(true);
    expect(result.stdout).not.toContain("localhost");
  });

  it("已结束的运行显示结束状态，但 url、owner 为 null；同一项目取最新的一次", async () => {
    const fake = new FakeSupervisor({
      playgrounds: [playground("demo")],
      runs: [
        run("demo", { runId: "old", state: "crashed", startedAt: 1 }),
        run("demo", { runId: "new", state: "finished", startedAt: 2 }),
      ],
    });
    const h = setup(fake);
    const [row] = rowsOf(h, await h.run(["status", "--json"]));
    expect(row).toMatchObject({ state: "finished", url: null, owner: null });
  });

  it("不存在的项目：PLAYGROUND_NOT_FOUND、退出码 3", async () => {
    const h = setup(new FakeSupervisor());
    const result = await h.run(["status", "nope", "--json"]);
    expect(result.code).toBe(3);
  });

  it("文字输出：运行状态按语言显示，--json 在两种语言下逐字相同", async () => {
    const make = () =>
      new FakeSupervisor({ playgrounds: [playground("demo")], runs: [run("demo")] });
    const en = await setup(make()).run(["status", "--lang", "en"]);
    const zh = await setup(make()).run(["status", "--lang", "zh-CN"]);
    expect(en.stdout).toContain("Ready");
    expect(zh.stdout).toContain("就绪");
    const a = await setup(make()).run(["status", "--json", "--lang", "en"]);
    const b = await setup(make()).run(["status", "--json", "--lang", "zh-CN"]);
    expect(a.stdout).toBe(b.stdout);
  });
});
