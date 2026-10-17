import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
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
  readCliLink,
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

  it("[CLI-COMMANDS-81] 安装：目录不存在时先建出 bin 目录，再建指向启动脚本的符号链接", async () => {
    const binDir = join(temp(), "bin");
    const result = await installCliLink(binDir, LAUNCHER);
    expect(result).toEqual({
      status: "installed",
      link: join(binDir, "runyard"),
      target: LAUNCHER,
    });
    expect(readlinkSync(join(binDir, "runyard"))).toBe(LAUNCHER);
  });

  it("[CLI-COMMANDS-84] 再次安装不变；链接指向旧位置的应用，在新位置的应用里安装则改指新位置", async () => {
    const binDir = temp();
    await installCliLink(binDir, LAUNCHER);
    expect((await installCliLink(binDir, LAUNCHER)).status).toBe("already-installed");
    const moved = "/Users/a/Apps/Runyard.app/Contents/Resources/bin/runyard";
    expect((await installCliLink(binDir, moved)).status).toBe("installed");
    expect(readlinkSync(join(binDir, "runyard"))).toBe(moved);
    // 原来在别的卷上的旧位置：同样只是换了家的 Runyard，改指当前的应用
    const old = temp();
    const stale = "/Volumes/Old/Runyard.app/Contents/Resources/bin/runyard";
    symlinkSync(stale, join(old, "runyard"));
    const now = "/Applications/Runyard.app/Contents/Resources/bin/runyard";
    expect((await installCliLink(old, now)).status).toBe("installed");
    expect(readlinkSync(join(old, "runyard"))).toBe(now);
  });

  it("[CLI-COMMANDS-82] 别人的 runyard（用户自己的脚本、指向别处的链接）不覆盖也不删除，脚本原样保留", async () => {
    const binDir = temp();
    const file = join(binDir, "runyard");
    writeFileSync(file, "#!/bin/sh\n");
    expect((await installCliLink(binDir, LAUNCHER)).status).toBe("conflict");
    expect((await uninstallCliLink(binDir)).status).toBe("conflict");
    expect(lstatSync(file).isFile()).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("#!/bin/sh\n");

    const other = temp();
    symlinkSync("/opt/homebrew/bin/runyard", join(other, "runyard"));
    expect((await installCliLink(other, LAUNCHER)).status).toBe("conflict");
    expect((await uninstallCliLink(other)).status).toBe("conflict");
    expect(readlinkSync(join(other, "runyard"))).toBe("/opt/homebrew/bin/runyard");
  });

  it("[CLI-COMMANDS-83] 移除只删指向 Runyard 的那个链接，同目录的其他文件都在；没有链接时说明没有", async () => {
    const binDir = temp();
    expect((await uninstallCliLink(binDir)).status).toBe("absent");
    mkdirSync(join(binDir, "keep"));
    writeFileSync(join(binDir, "other-tool"), "x");
    await installCliLink(binDir, LAUNCHER);
    expect((await uninstallCliLink(binDir)).status).toBe("removed");
    expect(() => lstatSync(join(binDir, "runyard"))).toThrow();
    expect(readdirSync(binDir).sort()).toEqual(["keep", "other-tool"]);
  });

  it("只认应用里的启动脚本的形状", () => {
    expect(isRunyardLauncher(LAUNCHER)).toBe(true);
    expect(isRunyardLauncher("/repo/packages/cli/src/main.ts")).toBe(false);
  });

  it("只读状态：没有、指向本应用、指向旧位置的应用、别人的东西，读状态不改任何东西", async () => {
    const binDir = temp();
    const link = join(binDir, "runyard");
    expect(await readCliLink(binDir, LAUNCHER)).toEqual({ status: "absent", link });
    symlinkSync(LAUNCHER, link);
    expect(await readCliLink(binDir, LAUNCHER)).toEqual({ status: "current", link });
    const elsewhere = "/Users/a/Apps/Runyard.app/Contents/Resources/bin/runyard";
    expect(await readCliLink(binDir, elsewhere)).toEqual({
      status: "stale",
      link,
      target: LAUNCHER,
    });
    const other = temp();
    symlinkSync("/opt/homebrew/bin/runyard", join(other, "runyard"));
    expect((await readCliLink(other, LAUNCHER)).status).toBe("conflict");
    expect(readlinkSync(link)).toBe(LAUNCHER);
  });
});
