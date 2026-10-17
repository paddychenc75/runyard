import { describe, expect, it } from "vitest";
import { buildTerminalEnv, isIdleForeground, loginShellCommand } from "./terminal-env.ts";

const base = { PATH: "/usr/bin:/bin", HOME: "/home/u", ELECTRON_RUN_AS_NODE: "1" };

describe("终端里的环境", () => {
  it("runyard 所在目录排在 PATH 最前面，原来的 PATH 都还在", () => {
    const env = buildTerminalEnv({
      base,
      extra: {},
      shell: "/bin/zsh",
      runyardBinDir: "/Applications/Runyard.app/Contents/Resources/bin",
    });
    expect(env.PATH).toBe("/Applications/Runyard.app/Contents/Resources/bin:/usr/bin:/bin");
  });

  it("没有 runyard 目录（源码运行）时 PATH 不动；应用自己的 PATH 为空时给系统默认值", () => {
    expect(
      buildTerminalEnv({ base, extra: {}, shell: "/bin/zsh", runyardBinDir: undefined }).PATH,
    ).toBe("/usr/bin:/bin");
    const bare = buildTerminalEnv({ base: {}, extra: {}, shell: "/bin/zsh", runyardBinDir: "/r" });
    expect(bare.PATH).toBe("/r:/usr/bin:/bin:/usr/sbin:/sbin");
  });

  it("去掉 Electron 的变量：终端里的 node 不能被当成 Electron 运行", () => {
    const env = buildTerminalEnv({
      base: { ...base, ELECTRON_NO_ATTACH_CONSOLE: "1" },
      extra: {},
      shell: "/bin/zsh",
      runyardBinDir: undefined,
    });
    expect(Object.keys(env).filter((key) => key.startsWith("ELECTRON_"))).toEqual([]);
  });

  it("[DESKTOP-TERMINAL-07] SHELL 写成实际运行的 shell（访达启动的应用环境里没有 SHELL）", () => {
    const env = buildTerminalEnv({ base, extra: {}, shell: "/bin/zsh", runyardBinDir: undefined });
    expect(env.SHELL).toBe("/bin/zsh");
  });

  it("声明 256 色和真彩色", () => {
    const env = buildTerminalEnv({ base, extra: {}, shell: "/bin/zsh", runyardBinDir: undefined });
    expect(env.TERM).toBe("xterm-256color");
    expect(env.COLORTERM).toBe("truecolor");
  });

  it("[DESKTOP-TERMINAL-10] 没有语言变量或不是 UTF-8 时补上 UTF-8；已经是 UTF-8 的不动；非 UTF-8 的 LC_ALL 去掉", () => {
    const none = buildTerminalEnv({ base, extra: {}, shell: "/bin/zsh", runyardBinDir: undefined });
    expect(none.LANG).toBe("en_US.UTF-8");
    const latin = buildTerminalEnv({
      base: { ...base, LANG: "C", LC_ALL: "C" },
      extra: {},
      shell: "/bin/zsh",
      runyardBinDir: undefined,
    });
    expect(latin.LANG).toBe("en_US.UTF-8");
    expect(latin.LC_ALL).toBeUndefined();
    const utf8 = buildTerminalEnv({
      base: { ...base, LANG: "zh_CN.UTF-8", LC_ALL: "zh_CN.UTF-8" },
      extra: {},
      shell: "/bin/zsh",
      runyardBinDir: undefined,
    });
    expect(utf8.LANG).toBe("zh_CN.UTF-8");
    expect(utf8.LC_ALL).toBe("zh_CN.UTF-8");
  });

  it("主进程叠加的变量盖过应用自己的环境", () => {
    const env = buildTerminalEnv({
      base,
      extra: { HOME: "/other" },
      shell: "/bin/zsh",
      runyardBinDir: undefined,
    });
    expect(env.HOME).toBe("/other");
  });
});

describe("登录 shell 的启动方式", () => {
  it("[DESKTOP-TERMINAL-07] 借 exec -a 把 argv[0] 换成 -名字，shell 路径作为参数传入、不拼进命令", () => {
    const { file, args } = loginShellCommand("/bin/zsh");
    expect(file).toBe("/bin/bash");
    expect(args[0]).toBe("-c");
    expect(args[1]).toContain("exec -a");
    expect(args[2]).toBe("/bin/zsh");
  });
});

describe("判断终端是否空闲", () => {
  it("前台进程就是 shell 自己（含登录 shell 的 - 前缀、带路径的写法）才算空闲", () => {
    expect(isIdleForeground("zsh", "/bin/zsh")).toBe(true);
    expect(isIdleForeground("-zsh", "/bin/zsh")).toBe(true);
    expect(isIdleForeground("/bin/zsh", "/bin/zsh")).toBe(true);
    expect(isIdleForeground("sleep", "/bin/zsh")).toBe(false);
    expect(isIdleForeground("node", "/bin/zsh")).toBe(false);
  });
});
