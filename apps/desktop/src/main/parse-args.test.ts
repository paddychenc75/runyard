import { describe, expect, it } from "vitest";
import { parseDesktopArgs, resolveDesktopLocale, userArgv } from "./parse-args.ts";

describe("parseDesktopArgs", () => {
  it("没有参数也没有环境变量时用真实主目录（root 为空）", () => {
    expect(parseDesktopArgs([], {})).toEqual({
      ok: true,
      args: {
        root: undefined,
        lang: undefined,
        theme: undefined,
        smoke: false,
        cliLink: undefined,
      },
    });
  });

  it("--root 优先于环境变量 RUNYARD_ROOT", () => {
    const parsed = parseDesktopArgs(["--root", "/tmp/a"], { RUNYARD_ROOT: "/tmp/b" });
    expect(parsed).toMatchObject({ ok: true, args: { root: "/tmp/a" } });
    expect(parseDesktopArgs([], { RUNYARD_ROOT: "/tmp/b" })).toMatchObject({
      args: { root: "/tmp/b" },
    });
  });

  it("--root 缺值、语言不认识都报问题", () => {
    expect(parseDesktopArgs(["--root"], {}).ok).toBe(false);
    expect(parseDesktopArgs(["--root", "--smoke"], {}).ok).toBe(false);
    expect(parseDesktopArgs(["--lang", "fr"], {}).ok).toBe(false);
  });

  it("认识 --lang 和 --smoke，忽略不认识的参数", () => {
    expect(parseDesktopArgs(["--lang", "en", "--smoke", "--foo"], {})).toMatchObject({
      ok: true,
      args: { lang: "en", smoke: true },
    });
  });
});

describe("parseDesktopArgs 的 --theme", () => {
  it("认识 system、light、dark，环境变量 RUNYARD_THEME 作后备，参数优先", () => {
    expect(parseDesktopArgs(["--theme", "dark"], {})).toMatchObject({ args: { theme: "dark" } });
    expect(parseDesktopArgs([], { RUNYARD_THEME: "light" })).toMatchObject({
      args: { theme: "light" },
    });
    expect(parseDesktopArgs(["--theme", "dark"], { RUNYARD_THEME: "light" })).toMatchObject({
      args: { theme: "dark" },
    });
  });

  it("缺值或不认识的主题报问题", () => {
    expect(parseDesktopArgs(["--theme"], {}).ok).toBe(false);
    expect(parseDesktopArgs(["--theme", "--smoke"], {}).ok).toBe(false);
    expect(parseDesktopArgs(["--theme", "blue"], {}).ok).toBe(false);
  });
});

describe("resolveDesktopLocale", () => {
  it("指定的语言优先；否则中文系统用中文，其余用英文", () => {
    expect(resolveDesktopLocale("en", ["zh-Hans-CN"])).toBe("en");
    expect(resolveDesktopLocale(undefined, ["zh-Hans-CN", "en-US"])).toBe("zh-CN");
    expect(resolveDesktopLocale(undefined, ["en-US", "zh-CN"])).toBe("en");
    expect(resolveDesktopLocale(undefined, [])).toBe("en");
  });
});

describe("parseDesktopArgs 的命令行安装参数", () => {
  it("--install-cli / --uninstall-cli 加可选的 --cli-bin-dir", () => {
    expect(parseDesktopArgs(["--install-cli", "--cli-bin-dir", "/tmp/b"], {})).toMatchObject({
      ok: true,
      args: { cliLink: { action: "install", binDir: "/tmp/b" } },
    });
    expect(parseDesktopArgs(["--uninstall-cli"], {})).toMatchObject({
      args: { cliLink: { action: "uninstall", binDir: undefined } },
    });
  });

  it("两个动作不能同时给，--cli-bin-dir 缺值报问题", () => {
    expect(parseDesktopArgs(["--install-cli", "--uninstall-cli"], {}).ok).toBe(false);
    expect(parseDesktopArgs(["--install-cli", "--cli-bin-dir"], {}).ok).toBe(false);
  });
});

describe("userArgv", () => {
  it("打好的包里 argv 没有脚本这一项，第一个参数不能被吞掉", () => {
    expect(userArgv(["/App/Runyard", "--root", "/tmp/a"], undefined)).toEqual(["--root", "/tmp/a"]);
  });

  it("源码运行（defaultApp）时跳过可执行文件和脚本", () => {
    expect(userArgv(["electron", "dist/main/index.mjs", "--root", "/tmp/a"], true)).toEqual([
      "--root",
      "/tmp/a",
    ]);
  });
});
