import { describe, expect, it } from "vitest";
import { parseDsclShell, parseGetentShell, shellKindOf } from "./login-shell.ts";

describe("shellKindOf：能解析的 shell 只有 zsh、bash、fish", () => {
  it("按文件名认", () => {
    expect(shellKindOf("/bin/zsh")).toBe("zsh");
    expect(shellKindOf("/opt/homebrew/bin/fish")).toBe("fish");
    expect(shellKindOf("/usr/local/bin/bash")).toBe("bash");
    expect(shellKindOf("-zsh")).toBe("zsh");
  });

  it("nu、tcsh、xonsh、sh、dash 不能解析", () => {
    for (const shell of [
      "/opt/homebrew/bin/nu",
      "/bin/tcsh",
      "/usr/bin/xonsh",
      "/bin/sh",
      "/bin/dash",
    ]) {
      expect(shellKindOf(shell)).toBeNull();
    }
  });
});

describe("目录服务输出的解析", () => {
  it("dscl", () => {
    expect(parseDsclShell("UserShell: /bin/zsh\n")).toBe("/bin/zsh");
    expect(parseDsclShell("garbage")).toBeUndefined();
  });

  it("getent", () => {
    expect(parseGetentShell("me:x:1000:1000:Me:/home/me:/usr/bin/fish\n")).toBe("/usr/bin/fish");
    expect(parseGetentShell("me:x:1000")).toBeUndefined();
  });
});
