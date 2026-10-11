import { describe, expect, it } from "vitest";
import { blockReason } from "./guard-bash.ts";

const HOME = "/Users/someone";

describe("guard-bash 钩子", () => {
  it("拦下删除或移动真实数据目录的命令", () => {
    for (const command of [
      "rm -rf ~/Runyard",
      "rm -rf ~/.runyard/state",
      'rm -rf "$HOME/Runyard/demo"',
      "cd /tmp && rm -r /Users/someone/.runyard",
      "mv ~/Runyard ~/old",
      "find ~/.runyard -name '*.json' -delete",
    ]) {
      expect(blockReason(command, HOME), command).toContain("已拦下");
    }
  });

  it("不拦：只读命令、临时目录、名字相近的别的目录", () => {
    for (const command of [
      "ls ~/Runyard",
      "cat ~/.runyard/settings.json",
      "rm -rf /tmp/runyard-check-abc",
      "rm -rf ~/Runyard-notes/tmp",
      "rm -rf ./node_modules",
      "pnpm verify",
    ]) {
      expect(blockReason(command, HOME), command).toBeUndefined();
    }
  });
});
