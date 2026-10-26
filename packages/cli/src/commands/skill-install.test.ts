import { join } from "node:path";
import { absPath } from "@runyard/platform";
import { afterEach, describe, expect, it } from "vitest";
import { Harness } from "../cli-harness.test.ts";
import { skillText } from "../skill/skill-text.ts";

const SKILL_TEXT = skillText("zh-CN", "darwin");
const open: Harness[] = [];
function harness(): Harness {
  const h = new Harness();
  open.push(h);
  return h;
}
afterEach(async () => {
  for (const h of open.splice(0)) await h.dispose();
});

const claudePath = (h: Harness) =>
  absPath(join(h.platform.paths.home, ".claude", "skills", "runyard", "SKILL.md"));
const agentsPath = (h: Harness) =>
  absPath(join(h.platform.paths.home, ".agents", "skills", "runyard", "SKILL.md"));

describe("skill install", () => {
  it("[CLI-COMMANDS-73] 空的主目录里写到两个位置，结果有 claude 和 agents 两项和绝对路径", async () => {
    const h = harness();
    const result = await h.run(["skill", "install", "--json"]);
    expect(result.code).toBe(0);
    const { installed } = h.json(result) as { installed: { target: string; path: string }[] };
    expect(installed.map((item) => item.target)).toEqual(["claude", "agents"]);
    expect(installed.map((item) => item.path)).toEqual([claudePath(h), agentsPath(h)]);
    expect(await h.platform.fs.readText(claudePath(h))).toBe(SKILL_TEXT);
    expect(await h.platform.fs.readText(agentsPath(h))).toBe(SKILL_TEXT);
    for (const target of [".claude", ".agents"])
      expect(
        await h.platform.fs.readText(
          absPath(join(h.platform.paths.home, target, "skills", "runyard", "SKILL.zh-CN.md")),
        ),
      ).toBe(skillText("zh-CN", h.platform.id));
  });

  it("[CLI-COMMANDS-74] --target claude 只写 claude 的位置", async () => {
    const h = harness();
    const result = await h.run(["skill", "install", "--target", "claude", "--json"]);
    expect((h.json(result).installed as unknown[]).length).toBe(1);
    expect(await h.platform.fs.exists(claudePath(h))).toBe(true);
    expect(await h.platform.fs.exists(agentsPath(h))).toBe(false);
  });

  it("[CLI-COMMANDS-75] 已有旧内容时用当前版本覆盖", async () => {
    const h = harness();
    h.fake.fs.writeFile(claudePath(h), "旧版本的说明");
    await h.run(["skill", "install", "--target", "claude"]);
    expect(await h.platform.fs.readText(claudePath(h))).toBe(SKILL_TEXT);
  });

  it("[CLI-COMMANDS-76] 说明是中文，含约定的要点，不教智能体设置语言", async () => {
    const h = harness();
    await h.run(["skill", "install", "--target", "agents"]);
    const text = (await h.platform.fs.readText(agentsPath(h))) ?? "";
    for (const point of ["--json", "--note", "--since", "--clean-after 30d", "error.hint"]) {
      expect(text, point).toContain(point);
    }
    expect(text).not.toContain("config set lang");
    expect(text).toMatch(/^---\nname: runyard\ndescription: [^\n]*[㐀-鿿][^\n]*\n---\n/);
    expect(text).toContain("runyard rm");
    // 全文快照：说明的任何改动都要在评审里被看见
    expect(text).toMatchSnapshot();
  });

  it("[CLI-COMMANDS-77] 目标值不对报 USAGE，退出码 2，不写任何文件", async () => {
    const h = harness();
    const result = await h.run(["skill", "install", "--target", "other", "--json"]);
    expect((h.json(result).error as { code: string }).code).toBe("USAGE");
    expect(result.code).toBe(2);
    expect(await h.platform.fs.exists(claudePath(h))).toBe(false);
    expect(await h.platform.fs.exists(agentsPath(h))).toBe(false);
  });

  it("不连管理进程：没有 connect 也成功", async () => {
    const h = harness();
    const result = await h.run(["skill", "install", "--target", "claude"]);
    expect(result.code).toBe(0);
    expect(h.connectCalls).toEqual([]);
  });
});

it("[CLI-COMMANDS-91] 同时安装并覆盖双语对照，返回结构仍只有执行正文路径", async () => {
  const h = harness();
  const chinese = absPath(
    join(h.platform.paths.home, ".claude", "skills", "runyard", "SKILL.zh-CN.md"),
  );
  const english = absPath(
    join(h.platform.paths.home, ".claude", "skills", "runyard", "SKILL.en.md"),
  );
  h.fake.fs.writeFile(chinese, "旧中文");
  h.fake.fs.writeFile(english, "Old English guide");
  h.fake.fs.writeFile(claudePath(h), "旧执行正文");
  const result = await h.run(["skill", "install", "--target", "claude", "--json"]);
  expect(h.json(result).installed).toEqual([{ target: "claude", path: claudePath(h) }]);
  expect(await h.platform.fs.readText(chinese)).toBe(SKILL_TEXT);
  expect(await h.platform.fs.readText(claudePath(h))).toBe(SKILL_TEXT);
  expect(await h.platform.fs.readText(english)).toBe(skillText("en", h.platform.id));
  expect(await h.platform.fs.exists(agentsPath(h))).toBe(false);
});
it("[CLI-COMMANDS-92] 中文正文与英文操作条目、章节和命令示例对应", async () => {
  const h = harness();
  await h.run(["skill", "install", "--target", "agents", "--json"]);
  const chinese = await h.platform.fs.readText(
    absPath(join(h.platform.paths.home, ".agents", "skills", "runyard", "SKILL.zh-CN.md")),
  );
  expect(chinese).not.toBeNull();
  const items = (s: string) => s.match(/^(?:\d+\.|-) /gm)?.length;
  const headings = (s: string) => s.match(/^##? /gm)?.length;
  const examples = (s: string) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  expect(items(chinese ?? "")).toBe(items(skillText("en", h.platform.id)));
  expect(headings(chinese ?? "")).toBe(headings(skillText("en", h.platform.id)));
  expect(examples(chinese ?? "")).toEqual(examples(skillText("en", h.platform.id)));
});

it("[CLI-COMMANDS-76] 英文和中文界面均安装中文执行正文与英文对照", async () => {
  for (const locale of ["en", "zh-CN"]) {
    const h = harness();
    await h.run(["skill", "install", "--lang", locale, "--json"]);
    expect(await h.platform.fs.readText(agentsPath(h))).toBe(SKILL_TEXT);
    expect(skillText("en", h.platform.id)).not.toMatch(/[㐀-鿿]/);
  }
});

const dirOf = (h: Harness, target: "claude" | "agents") =>
  absPath(join(h.platform.paths.home, `.${target}`, "skills", "runyard"));
type StatusTarget = { target: string; dir: string; state: string };
const statusOf = async (h: Harness): Promise<StatusTarget[]> =>
  (h.json(await h.run(["skill", "status", "--json"])) as { targets: StatusTarget[] }).targets;

describe("skill status", () => {
  it("[CLI-COMMANDS-93] 没装、装了当前版本、内容与随包版本不同分别是 missing、current、outdated", async () => {
    const h = harness();
    expect((await statusOf(h)).map((item) => [item.target, item.state])).toEqual([
      ["claude", "missing"],
      ["agents", "missing"],
    ]);
    await h.run(["skill", "install", "--target", "claude"]);
    h.fake.fs.writeFile(claudePath(h), "旧版本的说明");
    await h.run(["skill", "install", "--target", "agents"]);
    expect((await statusOf(h)).map((item) => [item.target, item.state])).toEqual([
      ["claude", "outdated"],
      ["agents", "current"],
    ]);
    expect((await statusOf(h)).map((item) => item.dir)).toEqual([
      dirOf(h, "claude"),
      dirOf(h, "agents"),
    ]);
    await h.run(["skill", "install", "--target", "claude"]);
    expect((await statusOf(h))[0]?.state).toBe("current");
  });

  it("[CLI-COMMANDS-94] 另一种安装形式（执行文件是中文、另有 SKILL.en.md）的内容与随包版本一致时也是 current", async () => {
    const h = harness();
    await h.run(["skill", "install", "--target", "claude"]);
    // 随包说明变了：只比较随包要写的每一份文件，多出来的文件不影响
    h.fake.fs.writeFile(absPath(join(dirOf(h, "claude"), "SKILL.en.md")), "别的版本留下的多余文件");
    expect((await statusOf(h))[0]?.state).toBe("current");
    h.fake.fs.writeFile(absPath(join(dirOf(h, "claude"), "SKILL.zh-CN.md")), "改过的对照");
    expect((await statusOf(h))[0]?.state).toBe("outdated");
  });

  it("[CLI-COMMANDS-98] 目标值不对报 USAGE，不连管理进程", async () => {
    const h = harness();
    const result = await h.run(["skill", "status", "--target", "other", "--json"]);
    expect(result.code).toBe(2);
    expect(h.connectCalls).toEqual([]);
  });
});

describe("skill uninstall", () => {
  it("[CLI-COMMANDS-95] 只把 runyard 自己写的目录移到废纸篓，另一个目标不动", async () => {
    const h = harness();
    await h.run(["skill", "install"]);
    const result = await h.run(["skill", "uninstall", "--target", "claude", "--json"]);
    expect(result.code).toBe(0);
    expect(h.json(result)).toEqual({
      removed: [{ target: "claude", dir: dirOf(h, "claude") }],
      skipped: [],
    });
    expect(await h.platform.fs.exists(claudePath(h))).toBe(false);
    expect(await h.platform.fs.exists(agentsPath(h))).toBe(true);
    expect(h.fake.fs.trashed.map((entry) => entry.path)).toEqual([dirOf(h, "claude")]);
  });

  it("[CLI-COMMANDS-96] 目录里有别人放的文件：整个目录原样保留，写进 skipped", async () => {
    const h = harness();
    await h.run(["skill", "install", "--target", "agents"]);
    const mine = absPath(join(dirOf(h, "agents"), "notes.txt"));
    h.fake.fs.writeFile(mine, "我自己的笔记");
    const result = await h.run(["skill", "uninstall", "--target", "agents", "--json"]);
    expect(result.code).toBe(0);
    expect(h.json(result)).toEqual({
      removed: [],
      skipped: [{ target: "agents", dir: dirOf(h, "agents"), reason: "foreign-files" }],
    });
    expect(await h.platform.fs.readText(mine)).toBe("我自己的笔记");
    expect(await h.platform.fs.exists(agentsPath(h))).toBe(true);
    expect(h.fake.fs.trashed).toEqual([]);
  });

  it("[CLI-COMMANDS-97] 没装过：成功，什么都不动；目标值不对报 USAGE", async () => {
    const h = harness();
    const none = await h.run(["skill", "uninstall", "--json"]);
    expect(h.json(none)).toEqual({ removed: [], skipped: [] });
    const bad = await h.run(["skill", "uninstall", "--target", "x", "--json"]);
    expect(bad.code).toBe(2);
    expect(h.fake.fs.trashed).toEqual([]);
  });
});
