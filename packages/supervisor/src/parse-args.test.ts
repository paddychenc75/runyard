import { describe, expect, it } from "vitest";
import { parseSupervisorArgs } from "./parse-args.ts";

const base = ["--home", "/h", "--version", "1.0.0", "--build", "1.0.0+abc"];

describe("入口参数", () => {
  it("必填项齐全：缺省 started-by 为 cli，host 取默认值，profile 缺省为正式版", () => {
    expect(parseSupervisorArgs(base, "node")).toEqual({
      ok: true,
      args: {
        home: "/h",
        profile: undefined,
        version: "1.0.0",
        build: "1.0.0+abc",
        startedBy: "cli",
        host: "node",
      },
    });
  });

  it("可以指定启动者、host 和开发版", () => {
    const parsed = parseSupervisorArgs(
      [...base, "--started-by", "app", "--host", "electron", "--profile", "dev"],
      "node",
    );
    expect(parsed).toMatchObject({
      ok: true,
      args: { startedBy: "app", host: "electron", profile: "dev" },
    });
  });

  it.each([
    ["缺 --home", ["--version", "1", "--build", "b"]],
    ["缺 --build", ["--home", "/h", "--version", "1"]],
    ["旗标没有值", [...base, "--profile"]],
    ["不是旗标", ["home", "/h"]],
    ["启动者不认识", [...base, "--started-by", "robot"]],
    ["host 不认识", [...base, "--host", "deno"]],
    ["profile 不认识", [...base, "--profile", "prod"]],
  ])("参数不对（%s）：给出问题，不抛错", (_name, argv) => {
    expect(parseSupervisorArgs(argv, "node").ok).toBe(false);
  });
});
