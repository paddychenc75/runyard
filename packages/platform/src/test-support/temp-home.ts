import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AbsPath, absPath } from "../path-types.ts";

// 每个测试自己的主目录：前缀要短，因为 socket 路径有 104 字节的上限（macOS 的临时目录本来就长）。
// 绝不使用真实的 ~/.runyard
export function makeTempHome(): { home: AbsPath; remove(): void } {
  const home = absPath(realpathSync(mkdtempSync(join(tmpdir(), "ry-"))));
  return { home, remove: () => rmSync(home, { recursive: true, force: true }) };
}
