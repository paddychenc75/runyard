import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ContractContext } from "./context.ts";

// tools 的契约：candidates 只按传入的环境找，找不到是空数组；packageManagers 是字符串数组。
// 找真文件的用例只对本机的实现跑（假平台的工具表是剧本，不看真实目录）。
export function toolsContract(ctx: ContractContext): void {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-")));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  const platform = ctx.create(home);

  describe("tools.candidates", () => {
    it('"tools.candidates" 不存在的工具返回空数组', async () => {
      expect(
        await platform.tools.candidates("ry-no-such-tool-xyz", { PATH: "/usr/bin:/bin" }),
      ).toEqual([]);
    });

    it('"tools.candidates" 在传入环境的 PATH 里找到可执行文件，来源是 env-path', async () => {
      if (!ctx.native) return;
      const file = join(home, "ry-fake-tool");
      writeFileSync(file, "#!/bin/sh\n");
      chmodSync(file, 0o755);
      const found = await platform.tools.candidates("ry-fake-tool", { PATH: home });
      expect(found).toEqual([{ path: file, origin: "env-path" }]);
    });
  });

  describe("tools.packageManagers", () => {
    it('"tools.packageManagers" 返回字符串数组', async () => {
      if (!ctx.native && ctx.complete !== true) return;
      const names = await platform.tools.packageManagers();
      expect(Array.isArray(names)).toBe(true);
      for (const name of names) expect(typeof name).toBe("string");
    });
  });
}
