import { chmodSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureSpawnHelperExecutable } from "./ensure-spawn-helper.ts";

function fakePackage(mode: number): string {
  const dir = mkdtempSync(join(tmpdir(), "runyard-spawn-helper-"));
  for (const arch of ["darwin-arm64", "darwin-x64"]) {
    mkdirSync(join(dir, "prebuilds", arch), { recursive: true });
    writeFileSync(join(dir, "prebuilds", arch, "spawn-helper"), "x");
    chmodSync(join(dir, "prebuilds", arch, "spawn-helper"), mode);
  }
  return dir;
}

describe("spawn-helper 的可执行位自检", () => {
  it("npm 和 pnpm 装下来是 0644：补上可执行位，开 shell 才不会报 posix_spawnp failed.", () => {
    const dir = fakePackage(0o644);
    expect(ensureSpawnHelperExecutable(dir)).toBe(2);
    expect(statSync(join(dir, "prebuilds", "darwin-arm64", "spawn-helper")).mode & 0o111).toBe(
      0o111,
    );
  });

  it("已经是可执行的（打包后的应用）：什么都不改", () => {
    const dir = fakePackage(0o755);
    expect(ensureSpawnHelperExecutable(dir)).toBe(0);
  });

  it("没有 prebuilds 目录（别的平台装的）：不报错", () => {
    expect(ensureSpawnHelperExecutable(mkdtempSync(join(tmpdir(), "runyard-spawn-helper-")))).toBe(
      0,
    );
  });
});
