import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRuntimeBundle, digestTree } from "./runtime-bundle.ts";

const dirs: string[] = [];
function temp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ry-bundle-")));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    // delete-allow: 测试自己建的临时目录
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("digestTree", () => {
  it("内容或文件名变了校验和就变，目录顺序不影响", () => {
    const a = temp();
    mkdirSync(join(a, "x"));
    writeFileSync(join(a, "x", "1.txt"), "one");
    writeFileSync(join(a, "2.txt"), "two");
    const before = digestTree(a);
    expect(digestTree(a)).toBe(before);
    writeFileSync(join(a, "2.txt"), "TWO");
    expect(digestTree(a)).not.toBe(before);
  });
});

describe("buildRuntimeBundle", () => {
  it("打出管理进程、命令行、模板数据、清单和可执行的启动脚本", async () => {
    const repoRoot = join(import.meta.dirname, "..", "..", "..");
    const out = temp();
    const manifest = await buildRuntimeBundle({
      repoRoot,
      outDir: out,
      version: "9.8.7",
      buildSuffix: "deadbeef",
    });
    expect(manifest.version).toBe("9.8.7");
    expect(manifest.build).toBe("9.8.7-deadbeef");
    const written = JSON.parse(readFileSync(join(out, "runyard", "manifest.json"), "utf8"));
    expect(written).toEqual(manifest);
    expect(manifest.templates).toBe(digestTree(join(out, "runyard", "templates")));
    for (const file of [
      "supervisor.mjs",
      "cli.mjs",
      "templates/builtin/html/template.json",
      "templates/runners/static/runner.json",
      "templates/tools/node.json",
    ]) {
      expect(statSync(join(out, "runyard", file)).isFile()).toBe(true);
    }
    expect(statSync(join(out, "bin", "runyard")).mode & 0o111).not.toBe(0);
  }, 60_000);
});
