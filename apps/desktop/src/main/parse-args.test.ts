import { describe, expect, it } from "vitest";
import { parseDesktopArgs, resolveDesktopLocale } from "./parse-args.ts";

describe("parseDesktopArgs", () => {
  it("没有参数也没有环境变量时用真实主目录（root 为空）", () => {
    expect(parseDesktopArgs([], {})).toEqual({
      ok: true,
      args: { root: undefined, lang: undefined, smoke: false },
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

describe("resolveDesktopLocale", () => {
  it("指定的语言优先；否则中文系统用中文，其余用英文", () => {
    expect(resolveDesktopLocale("en", ["zh-Hans-CN"])).toBe("en");
    expect(resolveDesktopLocale(undefined, ["zh-Hans-CN", "en-US"])).toBe("zh-CN");
    expect(resolveDesktopLocale(undefined, ["en-US", "zh-CN"])).toBe("en");
    expect(resolveDesktopLocale(undefined, [])).toBe("en");
  });
});
