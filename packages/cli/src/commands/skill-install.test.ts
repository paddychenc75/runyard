import { join } from "node:path";
import { absPath } from "@runyard/platform";
import { afterEach, describe, expect, it } from "vitest";
import { Harness } from "../cli-harness.test.ts";
import { SKILL_TEXT } from "../skill/skill-text.ts";

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

  it("[CLI-COMMANDS-76] 说明是英文，含约定的要点，不教智能体设置语言", async () => {
    const h = harness();
    await h.run(["skill", "install", "--target", "agents"]);
    const text = (await h.platform.fs.readText(agentsPath(h))) ?? "";
    for (const point of ["--json", "--note", "--since", "--clean-after 30d", "error.hint"]) {
      expect(text, point).toContain(point);
    }
    expect(text).not.toContain("config set lang");
    expect(text).not.toMatch(/[㐀-鿿]/);
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
