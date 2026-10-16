import { ClientError, clientError } from "@runyard/client";
import { joinPath, posixRelPath } from "@runyard/platform";
import { type ErrorCode, type ErrorParams, errorCodes, errorRegistry } from "@runyard/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { cliError } from "./cli-error.ts";
import { Harness, type HarnessOptions } from "./cli-harness.test.ts";
import type { CommandHandler } from "./commands/command-spec.ts";

// 命令行骨架的行为：全局参数、输出形态、退出码、用法错误、语言。
// 具体命令（new、run……）还没有实现，这里用替换进命令表的小实现代替它们。

const open: Harness[] = [];
function harness(options?: HarnessOptions): Harness {
  const h = new Harness(options);
  open.push(h);
  return h;
}
afterEach(async () => {
  for (const h of open.splice(0)) await h.dispose();
});

const CJK = /[\p{Script=Han}]/u;

// 登记表里每个错误码的合法参数。类型是穷举的：登记表新增错误码而这里没写，类型检查会失败
const sampleParams: { [C in ErrorCode]: ErrorParams<C> } = {
  INTERNAL: {},
  USAGE: {},
  NAME_INVALID: { name: "demo" },
  NAME_RESERVED: { name: "demo" },
  VAR_INVALID: { key: "title" },
  TEMPLATE_INVALID: { template: "react19" },
  PLAYGROUND_NOT_FOUND: { name: "demo" },
  TEMPLATE_NOT_FOUND: { template: "react19" },
  FOLDER_MISSING: { name: "demo" },
  RUN_NOT_FOUND: { runId: "r_1" },
  TOOL_MISSING: { tool: "go", required: ">=1.26" },
  TOOL_TOO_OLD: { tool: "go", required: ">=1.26", found: "1.20.1" },
  RUNTIME_MISSING: { tool: "node" },
  SETUP_FAILED: { name: "demo" },
  DEPS_OFFLINE: { name: "demo" },
  RUN_FAILED: { name: "demo" },
  SCRIPT_ERRORED: { name: "demo" },
  TEMPLATE_TEST_FAILED: { template: "react19", step: "reload" },
  READY_TIMEOUT: { name: "demo", seconds: 60 },
  NAME_EXISTS: { name: "demo" },
  BUSY: { name: "demo" },
  PATH_LOCKED: { name: "demo" },
  PATH_TOO_LONG: { name: "demo" },
  TRASH_UNAVAILABLE: { name: "demo" },
  PORT_IN_USE: { port: 7500 },
  APP_REQUIRED: {},
  SUPERVISOR_UNAVAILABLE: {},
  SUPERVISOR_OUTDATED: { runs: 2 },
  CLIENT_OUTDATED: {},
  NOT_SUPPORTED: {},
  DATA_FROM_NEWER_VERSION: { file: "settings.json", found: 2, supported: 1 },
};

function failWith(code: ErrorCode) {
  return async () => {
    throw cliError(code, sampleParams[code] as never);
  };
}

const okStatus: CommandHandler = async (context) => {
  context.out.result({ running: 0, playgrounds: [] }, [
    context.t("cli.config.setLang.body", { lang: "en" }),
  ]);
};

const notFound = async () => {
  throw cliError("PLAYGROUND_NOT_FOUND", { name: "no-such-project" });
};

describe("--json 输出", () => {
  it("[CLI-COMMANDS-01] 成功时标准输出恰好是一个对象，退出码 0", async () => {
    const h = harness({ handlers: { status: okStatus } });
    const result = await h.run(["status", "--json"]);
    expect(result.code).toBe(0);
    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(h.json(result)).toEqual({ running: 0, playgrounds: [] });
    expect(result.stderr).toBe("");
  });

  it("[CLI-COMMANDS-02] 出错时只有一个顶层键 error，code、data 对得上，退出码取自登记表", async () => {
    const h = harness({ handlers: { run: notFound } });
    const result = await h.run(["run", "no-such-project", "--json"]);
    const body = h.json(result);
    expect(Object.keys(body)).toEqual(["error"]);
    const error = body.error as Record<string, unknown>;
    expect(error.code).toBe("PLAYGROUND_NOT_FOUND");
    expect(error.data).toEqual({ name: "no-such-project" });
    expect(error.message).toEqual(expect.stringMatching(/\S/));
    expect(error.hint).toEqual(expect.stringMatching(/\S/));
    expect(CJK.test(result.stdout)).toBe(false);
    expect(result.code).toBe(3);
  });

  it("[CLI-COMMANDS-03] 这些错误的 hint 都含以 runyard 开头的完整命令", async () => {
    const codes: ErrorCode[] = [
      "TOOL_MISSING",
      "TOOL_TOO_OLD",
      "SETUP_FAILED",
      "DEPS_OFFLINE",
      "RUN_FAILED",
      "SCRIPT_ERRORED",
      "READY_TIMEOUT",
      "NAME_EXISTS",
    ];
    for (const code of codes) {
      const h = harness({ handlers: { run: failWith(code) } });
      const result = await h.run(["run", "demo", "--json"]);
      const error = h.json(result).error as { hint: string };
      expect(error.hint, code).toMatch(/runyard \S+/);
    }
  });

  it("[CLI-COMMANDS-05] 缺少必需的参数立即以 USAGE 结束，不读标准输入", async () => {
    // 调用入口根本没有标准输入这个参数；永不结束的管道在进程阶段的测试里验证
    const h = harness();
    const result = await h.run(["run", "--json"]);
    expect((h.json(result).error as { code: string }).code).toBe("USAGE");
    expect(result.code).toBe(2);
  });

  it("[CLI-COMMANDS-06] 提示放进 notices，标准输出仍只有一个对象", async () => {
    const h = harness({
      handlers: {
        new: async (context) => {
          context.out.notice({ code: "PATH_NEAR_LIMIT", params: { length: 240, limit: 255 } });
          context.out.result({ name: "demo" });
        },
      },
    });
    const result = await h.run(["new", "react19", "demo", "--json"]);
    expect(h.json(result)).toEqual({
      name: "demo",
      notices: [{ code: "PATH_NEAR_LIMIT", params: { length: 240, limit: 255 } }],
    });
  });

  it("[CLI-COMMANDS-06] 没有提示时结果里不出现 notices 键", async () => {
    const h = harness({ handlers: { status: okStatus } });
    expect(Object.keys(h.json(await h.run(["status", "--json"])))).not.toContain("notices");
  });

  it("[CLI-COMMANDS-07] --quiet 不改变 --json 的输出和退出码", async () => {
    const h = harness({
      handlers: {
        status: async (context) => {
          context.out.progress(context.t("cli.config.setLang.body", { lang: "en" }));
          context.out.notice({ code: "DEPS_FROM_CACHE", params: {} });
          context.out.result({ running: 0 });
        },
      },
    });
    const plain = await h.run(["status", "--json"]);
    const quiet = await h.run(["status", "--json", "--quiet"]);
    expect(quiet).toEqual(plain);
  });

  it("--json 下进度不写到标准输出；没有 --json 时进度写到标准错误，--quiet 压掉它", async () => {
    const h = harness({
      handlers: {
        status: async (context) => {
          context.out.progress(context.t("cli.config.setLang.body", { lang: "en" }));
          context.out.result({ running: 0 }, [
            context.t("cli.config.setLang.body", { lang: "zh-CN" }),
          ]);
        },
      },
    });
    const json = await h.run(["status", "--json"]);
    expect(json.stderr).toBe("");
    const text = await h.run(["status"]);
    expect(text.stderr).not.toBe("");
    expect(text.stdout).not.toBe("");
    const quiet = await h.run(["status", "--quiet"]);
    expect(quiet.stderr).toBe("");
    expect(quiet.stdout).toBe(text.stdout);
  });

  it("命令成功却没有写任何结果时，--json 下按 INTERNAL 报告", async () => {
    const h = harness({ handlers: { status: async () => {} } });
    const result = await h.run(["status", "--json"]);
    expect((h.json(result).error as { code: string }).code).toBe("INTERNAL");
    expect(result.code).toBe(1);
  });

  it("[CLI-COMMANDS-10] 意外异常报 INTERNAL，退出码 1，错误里没有堆栈和异常内容", async () => {
    const h = harness({
      handlers: {
        status: async () => {
          throw new Error("secret failure detail");
        },
      },
    });
    const result = await h.run(["status", "--json"]);
    const error = h.json(result).error as { code: string; data: unknown };
    expect(error.code).toBe("INTERNAL");
    expect(error.data).toEqual({});
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("secret failure detail");
    expect(result.stdout).not.toMatch(/\bat \S+ \(|\.ts:\d+/);
    expect(result.stderr).toBe("");
  });

  it("管理进程返回了不认识的错误码时按 INTERNAL 报告，不把原始代码当成已知码", async () => {
    const h = harness({
      handlers: {
        status: async () => {
          throw new ClientError({
            code: "FUTURE_CODE",
            params: {},
            debug: "from a newer supervisor",
          });
        },
      },
    });
    const result = await h.run(["status", "--json"]);
    expect((h.json(result).error as { code: string }).code).toBe("INTERNAL");
    expect(result.code).toBe(1);
  });

  it("错误带原始现场（cause）时 --json 里有 cause", async () => {
    const h = harness({
      handlers: {
        run: async () => {
          throw cliError(
            "RUN_FAILED",
            { name: "demo" },
            { cause: { exitCode: 1, outputTail: "x" } },
          );
        },
      },
    });
    const error = h.json(await h.run(["run", "demo", "--json"])).error as Record<string, unknown>;
    expect(error.cause).toEqual({ exitCode: 1, outputTail: "x" });
  });
});

describe("退出码", () => {
  it("[CLI-COMMANDS-08] 每个错误码的退出码都等于登记表里的值，没有任何错误码返回 8", async () => {
    for (const code of errorCodes) {
      const h = harness({
        handlers: {
          run: async () => {
            throw cliError(code, sampleParams[code] as never);
          },
        },
      });
      const json = await h.run(["run", "demo", "--json"]);
      expect(json.code, code).toBe(errorRegistry[code].exit);
      expect(json.code, code).not.toBe(8);
      expect((h.json(json).error as { code: string }).code).toBe(code);
      const text = await h.run(["run", "demo"]);
      expect(text.code, code).toBe(errorRegistry[code].exit);
      expect(text.stdout, code).toBe("");
      expect(text.stderr, code).not.toBe("");
    }
  });

  it("[CLI-COMMANDS-09] 未知命令、未知参数、缺少参数都报 USAGE，退出码 2", async () => {
    const h = harness();
    for (const args of [["frobnicate"], ["run", "demo", "--nope"], ["run"]]) {
      const result = await h.run([...args, "--json"]);
      expect((h.json(result).error as { code: string }).code, args.join(" ")).toBe("USAGE");
      expect(result.code, args.join(" ")).toBe(2);
    }
  });

  it("用法错误的其他形态：没有命令、未知子命令、多余参数、缺值、布尔选项带值", async () => {
    const h = harness();
    for (const args of [
      [],
      ["config", "frob"],
      ["config"],
      ["run", "a", "b"],
      ["run", "demo", "--timeout"],
      ["run", "demo", "--json=yes"],
    ]) {
      const result = await h.run(args);
      expect(result.code, args.join(" ")).toBe(2);
      expect(result.stdout, args.join(" ")).toBe("");
    }
  });

  it("[CLI-COMMANDS-21] 管理进程连不上也启动不了：SUPERVISOR_UNAVAILABLE，退出码 10，hint 含 runyard doctor", async () => {
    const h = harness({
      connect: async () => {
        throw clientError("SUPERVISOR_UNAVAILABLE", {}, "launch failed");
      },
      handlers: {
        status: async (context) => {
          await context.client();
        },
      },
    });
    const result = await h.run(["status", "--json"]);
    const error = h.json(result).error as { code: string; hint: string };
    expect(error.code).toBe("SUPERVISOR_UNAVAILABLE");
    expect(error.hint).toContain("runyard doctor");
    expect(result.code).toBe(10);
  });

  it("声明了不需要管理进程的命令去连它，按 INTERNAL 报告而不是真的连", async () => {
    const h = harness({
      handlers: {
        "config get": async (context) => {
          await context.client();
        },
      },
    });
    const result = await h.run(["config", "get", "lang", "--json"]);
    expect(result.code).toBe(1);
    expect(h.connectCalls).toHaveLength(0);
  });

  it("[CLI-COMMANDS-22] 不需要管理进程的命令和 --help 不尝试连接", async () => {
    const h = harness();
    await h.run(["config", "get", "lang"]);
    await h.run(["--help"]);
    await h.run(["run", "--help"]);
    await h.run(["template", "lint", "x"]);
    expect(h.connectCalls).toHaveLength(0);
  });

  it("命令第一次要用 client 时才连，一次调用只连一次，结束时关闭", async () => {
    const closed: string[] = [];
    const h = harness({
      connect: async () => ({ close: () => closed.push("closed") }) as never,
      handlers: {
        status: async (context) => {
          await context.client();
          await context.client();
          context.out.result({ running: 0 });
        },
      },
    });
    await h.run(["status", "--json"]);
    expect(h.connectCalls).toHaveLength(1);
    expect(closed).toEqual(["closed"]);
  });
});

describe("语言", () => {
  const failing = { run: notFound };

  it("[CLI-COMMANDS-11] 默认英文，不跟随系统语言", async () => {
    const h = harness({ handlers: failing });
    const system = await h.run(["run", "x"], { LANG: "zh_CN.UTF-8", LC_ALL: "zh_CN.UTF-8" });
    const english = await h.run(["run", "x", "--lang", "en"]);
    expect(system.stderr).toBe(english.stderr);
    expect(CJK.test(system.stderr)).toBe(false);
  });

  it("[CLI-COMMANDS-12] 优先级：参数 > 环境变量 > 已保存的设置 > 英文", async () => {
    const h = harness({ handlers: failing });
    const english = (await h.run(["run", "x", "--lang", "en"])).stderr;
    const chinese = (await h.run(["run", "x", "--lang", "zh-CN"])).stderr;
    expect(CJK.test(chinese)).toBe(true);
    expect(chinese).not.toBe(english);

    // 第四档：什么都没有
    expect((await h.run(["run", "x"])).stderr).toBe(english);
    // 第三档：已保存的设置
    await h.run(["config", "set", "lang", "zh-CN"]);
    expect((await h.run(["run", "x"])).stderr).toBe(chinese);
    // 第二档：环境变量盖过设置
    expect((await h.run(["run", "x"], { RUNYARD_LANG: "en" })).stderr).toBe(english);
    // 第一档：参数盖过环境变量
    expect((await h.run(["run", "x", "--lang", "zh-CN"], { RUNYARD_LANG: "en" })).stderr).toBe(
      chinese,
    );
    expect((await h.run(["run", "x", "--lang", "en"], { RUNYARD_LANG: "zh-CN" })).stderr).toBe(
      english,
    );
  });

  it("[CLI-COMMANDS-13] 不认识的语言值：按英文，标准错误一行英文提示，标准输出仍只有一个对象", async () => {
    const h = harness({ handlers: { status: okStatus } });
    const result = await h.run(["status", "--lang", "fr", "--json"]);
    expect(h.json(result)).toEqual({ running: 0, playgrounds: [] });
    expect(result.stderr.trimEnd().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("fr");
    expect(CJK.test(result.stderr)).toBe(false);
    expect(result.code).toBe(0);
  });

  it("[CLI-COMMANDS-13] 环境变量或设置里的值不认识时同样只在标准错误提示", async () => {
    const h = harness({ handlers: { status: okStatus } });
    const env = await h.run(["status", "--json"], { RUNYARD_LANG: "fr" });
    expect(env.stderr).toContain("fr");
    expect(() => h.json(env)).not.toThrow();
    await h.writeCliJson('{"formatVersion":1,"lang":"de"}');
    const saved = await h.run(["status", "--json"]);
    expect(saved.stderr).toBe("");
  });

  it("[CLI-COMMANDS-14] --json 在两种语言下逐字相同（成功、失败、列表）", async () => {
    const h = harness({
      handlers: {
        status: okStatus,
        run: notFound,
        "template list": async (context) => context.out.result({ templates: [] }),
      },
    });
    for (const args of [
      ["status", "--json"],
      ["run", "no-such-project", "--json"],
      ["template", "list", "--json"],
    ]) {
      const en = await h.run([...args, "--lang", "en"]);
      const zh = await h.run([...args, "--lang", "zh-CN"]);
      expect(zh.stdout, args.join(" ")).toBe(en.stdout);
      expect(zh.code).toBe(en.code);
    }
  });

  it("[CLI-COMMANDS-16] --lang 和环境变量不创建也不修改 cli.json", async () => {
    const h = harness({ handlers: { status: okStatus } });
    await h.run(["status", "--lang", "zh-CN"]);
    await h.run(["status"], { RUNYARD_LANG: "zh-CN" });
    expect(await h.platform.fs.exists(h.cliJson)).toBe(false);
    await h.writeCliJson('{"formatVersion":1,"lang":"en"}');
    await h.run(["status", "--lang", "zh-CN"]);
    await h.run(["status"], { RUNYARD_LANG: "zh-CN" });
    expect(await h.platform.fs.readText(h.cliJson)).toBe('{"formatVersion":1,"lang":"en"}');
  });

  it("--root 换掉主目录：设置读写发生在那个目录下，默认目录不受影响", async () => {
    const h = harness();
    const root = joinPath(h.platform.paths.home, posixRelPath("other-root"));
    await h.run(["config", "set", "lang", "zh-CN", "--root", root]);
    expect(await h.platform.fs.exists(h.cliJson)).toBe(false);
    // 路径经 resolve 规范化（Windows 上会补盘符），所以按“只建了一个别的平台”取，不按字符串查
    expect(h.roots.size).toBe(1);
    const other = [...h.roots.values()][0];
    const stateDir = other?.platform.paths.stateDir;
    expect(stateDir).toBeDefined();
    expect(other?.fs.exists(joinPath(stateDir as never, posixRelPath("cli.json")))).toBe(true);
  });
});
