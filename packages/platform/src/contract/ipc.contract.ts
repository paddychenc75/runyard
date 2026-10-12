import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isPlatformError } from "../platform-error.ts";
import type { ContractContext } from "./context.ts";

// ipc 的契约。长度上限、并发、残留、权限、假对端的完整测试在 posix/ipc/ 和 src/ 下的
// *.platform-dependent.test.ts（针对本机的实现）；这里验证“每个实现都有同样的行为”。
export function ipcContract(ctx: ContractContext): void {
  // 前缀要短：socket 路径有上限
  const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-")));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  const platform = ctx.create(home);
  const { ipc } = platform;

  describe("ipc.endpoint", () => {
    it('"ipc.endpoint" 是状态目录下 run/ 里的 socket', () => {
      expect(ipc.endpoint()).toBe(join(platform.paths.stateDir, "run", "supervisor.sock"));
    });

    it('"ipc.endpoint" 路径超过系统上限时抛 PATH_TOO_LONG', () => {
      const long = ctx.create(join(home, "x".repeat(200)));
      try {
        long.ipc.endpoint();
        expect.unreachable();
      } catch (error) {
        expect(isPlatformError(error) && error.error.code).toBe("PATH_TOO_LONG");
      }
    });
  });

  describe("ipc.computeProof", () => {
    it('"ipc.computeProof" 与 RFC 4231 测试用例 2 一致', () => {
      expect(ipc.computeProof(Buffer.from("Jefe"), "what do ya want for nothing?")).toBe(
        "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
      );
    });
  });

  describe("ipc.verifyProof", () => {
    it('"ipc.verifyProof" 正确通过，错误和格式不对都是 false', () => {
      const key = Buffer.from("k");
      const proof = ipc.computeProof(key, "m");
      expect(ipc.verifyProof(key, "m", proof)).toBe(true);
      expect(ipc.verifyProof(key, "other", proof)).toBe(false);
      expect(ipc.verifyProof(key, "m", proof.toUpperCase())).toBe(false);
      expect(ipc.verifyProof(key, "m", "")).toBe(false);
    });
  });

  if (!ctx.native) return;

  describe("ipc.listen", () => {
    let live: Awaited<ReturnType<typeof ipc.listen>> | undefined;
    beforeAll(async () => {
      live = await ipc.listen();
    });
    afterAll(async () => {
      await new Promise((resolve) => live?.close(resolve));
    });

    it('"ipc.listen" 监听着；已有持锁者时第二次抛 BUSY', async () => {
      expect(live?.listening).toBe(true);
      await expect(ipc.listen()).rejects.toMatchObject({ error: { code: "BUSY" } });
    });

    it('"ipc.connect" 连得上监听者', async () => {
      const socket = await ipc.connect(1000);
      socket.destroy();
    });
  });

  describe("ipc.connect", () => {
    it('"ipc.connect" 没有监听者时抛 SUPERVISOR_UNAVAILABLE', async () => {
      const other = ctx.create(join(home, "empty"));
      await expect(other.ipc.connect(200)).rejects.toMatchObject({
        error: { code: "SUPERVISOR_UNAVAILABLE" },
      });
    });
  });
}
