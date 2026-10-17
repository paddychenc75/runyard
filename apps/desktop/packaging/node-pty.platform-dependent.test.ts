import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodePtyProblems, stageNodePty } from "./node-pty.ts";

// 假的 node-pty 包：只有打包代码关心的目录和文件，spawn-helper 故意是 0644（和 npm、pnpm 装下来一样）
function fakePackage(): string {
  const dir = mkdtempSync(join(tmpdir(), "runyard-nodepty-src-"));
  mkdirSync(join(dir, "lib"));
  writeFileSync(join(dir, "lib", "index.js"), "module.exports = {};");
  writeFileSync(
    join(dir, "package.json"),
    '{"name":"node-pty","version":"1.1.0","scripts":{"install":"node-gyp rebuild"},"dependencies":{"node-addon-api":"^7.1.0"}}',
  );
  writeFileSync(join(dir, "LICENSE"), "MIT");
  for (const arch of ["darwin-arm64", "darwin-x64", "win32-x64"]) {
    mkdirSync(join(dir, "prebuilds", arch), { recursive: true });
    writeFileSync(join(dir, "prebuilds", arch, "pty.node"), "binary");
    writeFileSync(join(dir, "prebuilds", arch, "spawn-helper"), "helper");
    chmodSync(join(dir, "prebuilds", arch, "spawn-helper"), 0o644);
  }
  return dir;
}

/** 打包后的资源目录：stageNodePty 往 app.asar.unpacked 里拷，布局和打好的应用一样 */
function packedResources(): string {
  const resources = mkdtempSync(join(tmpdir(), "runyard-nodepty-res-"));
  stageNodePty(join(resources, "app.asar.unpacked"), fakePackage());
  return resources;
}

describe("node-pty 的打包", () => {
  it("拷进应用目录时只带 macOS 的预编译文件，spawn-helper 加上可执行位，lib 和许可证带上", () => {
    const appDir = mkdtempSync(join(tmpdir(), "runyard-nodepty-app-"));
    const target = stageNodePty(appDir, fakePackage());
    expect(readFileSync(join(target, "lib", "index.js"), "utf8")).toContain("module.exports");
    for (const arch of ["darwin-arm64", "darwin-x64"]) {
      expect(statSync(join(target, "prebuilds", arch, "spawn-helper")).mode & 0o111).toBe(0o111);
    }
    expect(() => statSync(join(target, "prebuilds", "win32-x64"))).toThrow();
  });

  it("拷出来的 package.json 去掉依赖和安装脚本（node-addon-api 只在编译时用，留着会让 electron-builder 找不到而打包失败）", () => {
    const appDir = mkdtempSync(join(tmpdir(), "runyard-nodepty-app-"));
    const target = stageNodePty(appDir, fakePackage());
    const manifest = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(manifest).toEqual({ name: "node-pty", version: "1.1.0" });
  });

  it("预编译目录缺了就报错，不悄悄打出一个开不了终端的包", () => {
    const source = fakePackage();
    const appDir = mkdtempSync(join(tmpdir(), "runyard-nodepty-app-"));
    expect(() => stageNodePty(appDir, join(source, "lib"))).toThrow();
  });

  it("断言：拷好的布局通过", () => {
    expect(nodePtyProblems(packedResources())).toEqual([]);
  });

  it("断言：没解到 asar 之外就是问题", () => {
    const resources = mkdtempSync(join(tmpdir(), "runyard-nodepty-res-"));
    expect(nodePtyProblems(resources).join("\n")).toContain("没有解到 asar 之外");
  });

  it("断言：spawn-helper 没有可执行位是问题（开终端会报 posix_spawnp failed.）", () => {
    const resources = packedResources();
    const helper = join(
      resources,
      "app.asar.unpacked",
      "node_modules",
      "node-pty",
      "prebuilds",
      "darwin-x64",
      "spawn-helper",
    );
    chmodSync(helper, 0o644);
    expect(nodePtyProblems(resources).join("\n")).toContain("darwin-x64/spawn-helper 没有可执行位");
  });

  it("断言：带了 Windows 的预编译文件是问题", () => {
    const resources = packedResources();
    mkdirSync(
      join(resources, "app.asar.unpacked", "node_modules", "node-pty", "prebuilds", "win32-x64"),
      { recursive: true },
    );
    expect(nodePtyProblems(resources).join("\n")).toContain("win32-x64");
  });
});
