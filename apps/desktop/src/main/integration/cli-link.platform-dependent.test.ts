import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cliLauncherPath,
  defaultCliBinDir,
  installCliLink,
  isRunyardLauncher,
  uninstallCliLink,
} from "./cli-link.ts";

const dirs: string[] = [];
function temp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ry-link-")));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    // delete-allow: 测试自己建的临时目录
    rmSync(dir, { recursive: true, force: true });
  }
});

const LAUNCHER = "/Applications/Runyard.app/Contents/Resources/bin/runyard";

describe("命令行装到 PATH", () => {
  it("默认放在用户目录的 .local/bin，启动脚本在资源目录的 bin 下", () => {
    expect(defaultCliBinDir("/Users/a")).toBe("/Users/a/.local/bin");
    expect(cliLauncherPath("/R/Contents/Resources")).toBe("/R/Contents/Resources/bin/runyard");
  });

  it("安装：建出 bin 目录和指向启动脚本的符号链接", async () => {
    const binDir = join(temp(), "bin");
    const result = await installCliLink(binDir, LAUNCHER);
    expect(result).toEqual({
      status: "installed",
      link: join(binDir, "runyard"),
      target: LAUNCHER,
    });
    expect(readlinkSync(join(binDir, "runyard"))).toBe(LAUNCHER);
  });

  it("再次安装不变；应用搬了家则把链接改指新位置", async () => {
    const binDir = temp();
    await installCliLink(binDir, LAUNCHER);
    expect((await installCliLink(binDir, LAUNCHER)).status).toBe("already-installed");
    const moved = "/Users/a/Apps/Runyard.app/Contents/Resources/bin/runyard";
    expect((await installCliLink(binDir, moved)).status).toBe("installed");
    expect(readlinkSync(join(binDir, "runyard"))).toBe(moved);
  });

  it("别人的 runyard（普通文件、指向别处的链接）不覆盖也不删除", async () => {
    const binDir = temp();
    const file = join(binDir, "runyard");
    writeFileSync(file, "#!/bin/sh\n");
    expect((await installCliLink(binDir, LAUNCHER)).status).toBe("conflict");
    expect((await uninstallCliLink(binDir)).status).toBe("conflict");
    expect(lstatSync(file).isFile()).toBe(true);

    const other = temp();
    symlinkSync("/opt/homebrew/bin/runyard", join(other, "runyard"));
    expect((await installCliLink(other, LAUNCHER)).status).toBe("conflict");
    expect((await uninstallCliLink(other)).status).toBe("conflict");
    expect(readlinkSync(join(other, "runyard"))).toBe("/opt/homebrew/bin/runyard");
  });

  it("卸载：只删指向应用的链接，没有链接时说明没有", async () => {
    const binDir = temp();
    expect((await uninstallCliLink(binDir)).status).toBe("absent");
    await installCliLink(binDir, LAUNCHER);
    expect((await uninstallCliLink(binDir)).status).toBe("removed");
    expect(() => lstatSync(join(binDir, "runyard"))).toThrow();
    mkdirSync(join(binDir, "keep"));
  });

  it("只认应用里的启动脚本的形状", () => {
    expect(isRunyardLauncher(LAUNCHER)).toBe(true);
    expect(isRunyardLauncher("/repo/packages/cli/src/main.ts")).toBe(false);
  });
});
