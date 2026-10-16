import type { LogEntry } from "@runyard/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Harness } from "../cli-harness.test.ts";
import { FakeSupervisor, playground, run, stdout } from "./fake-supervisor.test.ts";

const open: Harness[] = [];
afterEach(async () => {
  for (const h of open.splice(0)) await h.dispose();
});

function setup(fake: FakeSupervisor): Harness {
  const h = new Harness({ connect: async () => fake.client });
  open.push(h);
  return h;
}

const lines = (count: number): LogEntry[] =>
  Array.from({ length: count }, (_, i) => stdout(`line ${i + 1}`, i + 1));

function demo(entries: LogEntry[], state: "ready" | "running" = "ready") {
  return new FakeSupervisor({
    playgrounds: [playground("demo")],
    runs: [run("demo", { state })],
    logs: { demo: { runId: "run-demo", entries } },
  });
}

describe("logs（一次读取）", () => {
  it("[RUN-LOGS-18] [CLI-COMMANDS-55] 不带 --tail：500 行只返回最后 200 行，truncated 为 true，不含颜色码", async () => {
    const entries = [...lines(499), stdout("\u001b[31mred\u001b[0m", 500)];
    const fake = demo(entries);
    const h = setup(fake);
    const result = await h.run(["logs", "demo", "--json"]);
    const json = h.json(result);
    expect(json.lines).toBe(200);
    expect(json.truncated).toBe(true);
    const text = String(json.text);
    expect(text.startsWith("line 301\n")).toBe(true);
    expect(text.endsWith("red\n")).toBe(true);
    expect(text).not.toContain("\u001b");
    expect(json.cursor).toBe("run-demo:500");
    expect(json.state).toBe("ready");
  });

  it("刚好 200 行不算截断；--tail 改变行数", async () => {
    const h = setup(demo(lines(200)));
    const exact = h.json(await h.run(["logs", "demo", "--json"]));
    expect(exact).toMatchObject({ lines: 200, truncated: false });
    const three = h.json(await h.run(["logs", "demo", "--tail", "3", "--json"]));
    expect(three).toMatchObject({
      lines: 3,
      truncated: true,
      text: "line 198\nline 199\nline 200\n",
    });
  });

  it("--tail 不是正整数：USAGE，退出码 2，没有连管理进程", async () => {
    const h = setup(demo(lines(3)));
    for (const bad of ["0", "-1", "abc", "1.5"]) {
      const result = await h.run(["logs", "demo", "--tail", bad, "--json"]);
      expect(result.code).toBe(2);
    }
    expect(h.connectCalls).toHaveLength(0);
  });

  it("[CLI-COMMANDS-56] --since 只返回游标之后的新内容，并给出新游标", async () => {
    const fake = demo(lines(12));
    const h = setup(fake);
    const first = h.json(await h.run(["logs", "demo", "--json"]));
    expect(first.cursor).toBe("run-demo:12");
    fake.logs.get("demo")?.entries.push(stdout("line 13", 13));
    const next = h.json(await h.run(["logs", "demo", "--since", "run-demo:12", "--json"]));
    expect(next).toMatchObject({ lines: 1, text: "line 13\n", cursor: "run-demo:13" });
  });

  it("--since 不加默认的 200 行上限，新内容多于 200 行也不丢", async () => {
    const fake = demo(lines(300));
    const h = setup(fake);
    const result = h.json(await h.run(["logs", "demo", "--since", "run-demo:0", "--json"]));
    expect(result).toMatchObject({ lines: 300, truncated: false });
  });

  it("[CLI-COMMANDS-57] --raw 保留颜色码，不带的没有", async () => {
    const fake = demo([stdout("\u001b[32mok\u001b[0m")]);
    const h = setup(fake);
    const raw = h.json(await h.run(["logs", "demo", "--raw", "--json"]));
    const clean = h.json(await h.run(["logs", "demo", "--json"]));
    expect(String(raw.text)).toContain("\u001b[32m");
    expect(clean.text).toBe("ok\n");
  });

  it("[CLI-COMMANDS-58] 从没运行过：空文本，游标和状态为 null，退出码 0", async () => {
    const fake = new FakeSupervisor({ playgrounds: [playground("demo")] });
    const h = setup(fake);
    const result = await h.run(["logs", "demo", "--json"]);
    expect(result.code).toBe(0);
    expect(h.json(result)).toEqual({
      text: "",
      lines: 0,
      cursor: null,
      state: null,
      truncated: false,
    });
  });

  it("不存在的项目：PLAYGROUND_NOT_FOUND，退出码 3", async () => {
    const h = setup(new FakeSupervisor());
    expect((await h.run(["logs", "nope", "--json"])).code).toBe(3);
  });

  it("管理进程插入的提示按提示码翻译：--json 永远英文，文字输出按当前语言；命令行条目前加 $", async () => {
    const entries: LogEntry[] = [
      { at: 1, kind: "command", text: "pnpm dev" },
      { at: 2, kind: "system", notice: { code: "RELOADING", params: {} } },
    ];
    const h = setup(demo(entries));
    const en = await h.run(["logs", "demo", "--json", "--lang", "en"]);
    const zh = await h.run(["logs", "demo", "--json", "--lang", "zh-CN"]);
    expect(en.stdout).toBe(zh.stdout);
    expect(String(h.json(en).text)).toBe("$ pnpm dev\nFiles changed, reloading.\n");
    const human = await h.run(["logs", "demo", "--lang", "zh-CN"]);
    expect(human.stdout.startsWith("$ pnpm dev\n")).toBe(true);
    expect(human.stdout).not.toContain("Files changed");
  });

  it("文字输出只有日志正文，没有多余的行", async () => {
    const h = setup(demo([stdout("a"), stdout("b")]));
    expect((await h.run(["logs", "demo"])).stdout).toBe("a\nb\n");
  });
});

describe("logs --follow", () => {
  it("[CLI-COMMANDS-59] 陆续输出两行后结束：每行一个对象，最后一行是 end，退出码 0，订阅都已取消", async () => {
    const fake = new FakeSupervisor({
      playgrounds: [playground("hello-py", { kind: "oneshot" })],
      runs: [run("hello-py", { state: "running", kind: "oneshot" })],
      logs: { "hello-py": { runId: "run-hello-py", entries: [] } },
    });
    const h = setup(fake);
    const running = h.run(["logs", "hello-py", "--follow", "--json"]);
    await vi.waitFor(() => expect(fake.listening).toBe(2));
    fake.emit("hello-py", stdout("one"));
    await vi.waitFor(() =>
      expect(fake.calls.filter((c) => c.method === "logs.read")).toHaveLength(2),
    );
    fake.emit("hello-py", stdout("two"));
    fake.finish("hello-py", "finished");
    const result = await running;
    expect(result.code).toBe(0);
    const objects = result.stdout
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const last = objects.at(-1);
    expect(last).toEqual({ end: true, cursor: "run-hello-py:2" });
    expect(
      objects
        .slice(0, -1)
        .map((o) => o.text)
        .join(""),
    ).toBe("one\ntwo\n");
    for (const object of objects.slice(0, -1)) {
      expect(Object.keys(object).sort()).toEqual(["cursor", "state", "text"]);
    }
    expect(fake.listening).toBe(0);
  });

  it("每次只读游标之后的内容：先于等待到达的信号不丢、不重复", async () => {
    const fake = demo(lines(2), "running");
    const h = setup(fake);
    const running = h.run(["logs", "demo", "--follow", "--json"]);
    await vi.waitFor(() => expect(fake.listening).toBe(2));
    // 日志和结束状态在同一时刻到达：一次读取就能带上全部
    fake.emit("demo", stdout("line 3", 3), "finished");
    const result = await running;
    const texts = result.stdout
      .trimEnd()
      .split("\n")
      .map((line) => (JSON.parse(line) as { text?: string }).text ?? "");
    expect(texts.join("")).toBe("line 1\nline 2\nline 3\n");
  });

  it("运行已经结束：输出已有内容（默认最后 200 行）后立即结束", async () => {
    const fake = new FakeSupervisor({
      playgrounds: [playground("demo")],
      runs: [run("demo", { state: "stopped" })],
      logs: { demo: { runId: "run-demo", entries: lines(3) } },
    });
    const h = setup(fake);
    const result = await h.run(["logs", "demo", "--follow", "--json"]);
    const objects = result.stdout.trimEnd().split("\n");
    expect(objects).toHaveLength(2);
    expect(JSON.parse(objects[1] ?? "")).toEqual({ end: true, cursor: "run-demo:3" });
  });

  it("从没运行过：没有可跟随的，立即结束，cursor 为 null", async () => {
    const h = setup(new FakeSupervisor({ playgrounds: [playground("demo")] }));
    const result = await h.run(["logs", "demo", "--follow", "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ end: true, cursor: null });
  });

  it("文字模式下 --follow 直接打印日志正文", async () => {
    const fake = demo(lines(1), "running");
    const h = setup(fake);
    const running = h.run(["logs", "demo", "--follow"]);
    await vi.waitFor(() => expect(fake.listening).toBe(2));
    fake.emit("demo", stdout("line 2", 2), "finished");
    expect((await running).stdout).toBe("line 1\nline 2\n");
  });
});
