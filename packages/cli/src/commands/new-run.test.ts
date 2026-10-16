import type { RunyardClient } from "@runyard/client";
import { ClientError, clientError } from "@runyard/client";
import type { CreatedBy, Playground, RunSnapshot } from "@runyard/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { Harness } from "../cli-harness.test.ts";

// new、run 的行为：管理进程换成按方法名登记的假处理函数，断言发出去的请求和整理出来的结果。
// 管理进程一侧的规则（重复启动、停止中再启动、端口占用）在 supervisor 的测试里，这里只验证命令行不改写它们。

const open: Harness[] = [];
type Calls = { method: string; params: Record<string, unknown> }[];
type Handlers = Record<string, (params: never) => unknown>;

function harness(handlers: Handlers): { h: Harness; calls: Calls } {
  const calls: Calls = [];
  const client = {
    call: async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params });
      const handler = handlers[method];
      if (handler === undefined) throw new Error(`unexpected call ${method}`);
      return handler(params as never);
    },
    close: () => undefined,
  } as unknown as RunyardClient;
  const h = new Harness({ connect: async () => client });
  open.push(h);
  return { h, calls };
}
afterEach(async () => {
  for (const h of open.splice(0)) await h.dispose();
});

const names = (calls: Calls) => calls.map((call) => call.method);

function playground(overrides: Partial<Playground> = {}): Playground {
  return {
    id: "01JABC",
    name: "demo",
    path: "/Users/me/Runyard/demo",
    kind: "server",
    template: { id: "react19", source: "builtin", appVersion: "0.1.0" },
    runner: "vite",
    entry: "src/App.tsx",
    createdAt: 1,
    createdBy: { kind: "cli" },
    autoClean: { enabled: false },
    lastUsedAt: 1,
    ...overrides,
  };
}

const owner = { kind: "cli", command: "runyard" } as const;

function serverRun(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    runId: "run-1",
    playgroundId: "01JABC",
    name: "demo",
    kind: "server",
    state: "ready",
    owner,
    port: 7104,
    url: "http://127.0.0.1:7104",
    readyMs: 1180,
    startedAt: 1,
    cursor: "run-1:12",
    ...overrides,
  };
}

function scriptRun(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    runId: "run-2",
    playgroundId: "01JABC",
    name: "hello-py",
    kind: "oneshot",
    state: "finished",
    owner,
    exitCode: 0,
    durationMs: 41,
    startedAt: 1,
    cursor: "run-2:3",
    ...overrides,
  };
}

const logs =
  (lines: string[], extra: { truncated?: boolean; cursor?: string } = {}) =>
  () => ({
    entries: lines.map((text) => ({ at: 1, kind: "stdout" as const, text })),
    cursor: extra.cursor ?? "run-1:12",
    truncated: extra.truncated ?? false,
    state: "ready" as const,
  });

const settings = () => ({ cliIdleStopMinutes: 30 });
const created =
  (extra: Partial<Playground> = {}) =>
  () => ({
    playground: playground(extra),
    created: true,
  });

describe("new", () => {
  it("[CLI-COMMANDS-24] 创建并启动服务：结果含项目信息和 run 对象", async () => {
    const { h, calls } = harness({
      "playground.create": created({ name: "pricing-table" }),
      "run.start": () => serverRun({ name: "pricing-table" }),
      "logs.read": logs(["ready in 300 ms"]),
      "settings.get": settings,
    });
    const result = await h.run(
      ["new", "react19", "pricing-table", "--run", "--note", "pricing table layout test", "--json"],
      {},
    );
    expect(result.code).toBe(0);
    const json = h.json(result);
    expect(json).toMatchObject({
      id: "01JABC",
      name: "pricing-table",
      path: "/Users/me/Runyard/demo",
      template: "react19",
      created: true,
      entry: "src/App.tsx",
      retention: "kept",
    });
    expect(json.run).toEqual({
      runId: "run-1",
      state: "ready",
      kind: "server",
      url: "http://127.0.0.1:7104",
      port: 7104,
      readyMs: 1180,
      alreadyRunning: false,
      owner: "cli",
      idleStopMinutes: 30,
      logTail: "ready in 300 ms\n",
      cursor: "run-1:12",
    });
    const create = calls.find((call) => call.method === "playground.create");
    expect(create?.params).toMatchObject({
      template: "react19",
      name: "pricing-table",
      note: "pricing table layout test",
    });
    expect(calls.find((call) => call.method === "run.start")?.params).toMatchObject({
      playground: "01JABC",
      wait: "ready",
      timeoutMs: 60_000,
    });
  });

  it("[CLI-COMMANDS-25] 创建并运行脚本：run 对象是脚本的形状，没有 url 和 port", async () => {
    const { h, calls } = harness({
      "playground.create": created({ name: "hello", kind: "oneshot" }),
      "run.start": () => scriptRun({ name: "hello" }),
      "logs.read": logs(["Hello"], { cursor: "run-2:3" }),
    });
    const result = await h.run(["new", "python", "hello", "--run", "--json"]);
    expect(result.code).toBe(0);
    expect(h.json(result).run).toEqual({
      runId: "run-2",
      state: "finished",
      kind: "oneshot",
      exitCode: 0,
      durationMs: 41,
      stale: false,
      alreadyRunning: false,
      output: "Hello\n",
      truncated: false,
      cursor: "run-2:3",
    });
    // 脚本等到退出；不需要设置
    expect(calls.find((call) => call.method === "run.start")?.params).toMatchObject({
      wait: "exit",
    });
    expect(names(calls)).not.toContain("settings.get");
  });

  it("[CLI-COMMANDS-26] 只创建不运行：没有 run 键，没有启动任何进程", async () => {
    const { h, calls } = harness({ "playground.create": created() });
    const result = await h.run(["new", "react19", "demo", "--json"]);
    expect(result.code).toBe(0);
    expect(h.json(result)).not.toHaveProperty("run");
    expect(names(calls)).toEqual(["playground.create"]);
  });

  it("[CLI-COMMANDS-27] --no-wait：请求被接受就返回，不等就绪", async () => {
    const { h, calls } = harness({
      "playground.create": created(),
      "run.start": () => {
        const { readyMs: _ignored, ...starting } = serverRun({ state: "starting" });
        return starting;
      },
      "logs.read": logs([]),
      "settings.get": settings,
    });
    const result = await h.run(["new", "react19", "demo", "--run", "--no-wait", "--json"]);
    const run = h.json(result).run as Record<string, unknown>;
    expect(run.state).toBe("starting");
    expect(run).not.toHaveProperty("readyMs");
    expect(calls.find((call) => call.method === "run.start")?.params).toMatchObject({
      wait: "none",
    });
  });

  it("[CLI-COMMANDS-28] 等待超时：READY_TIMEOUT 退出码 7，项目已创建，不停进程", async () => {
    const { h, calls } = harness({
      "playground.create": created(),
      "run.start": () => {
        throw clientError("READY_TIMEOUT", { name: "demo", seconds: 1 }, "ready timeout");
      },
    });
    const result = await h.run(["new", "react19", "demo", "--run", "--timeout", "1", "--json"]);
    expect(result.code).toBe(7);
    expect(h.json(result).error).toMatchObject({
      code: "READY_TIMEOUT",
      data: { name: "demo", seconds: 1 },
    });
    // 本次调用只决定等多久：请求带的是 1 秒，之后没有任何停止的请求
    expect(calls.find((call) => call.method === "run.start")?.params).toMatchObject({
      timeoutMs: 1000,
    });
    expect(names(calls)).toEqual(["playground.create", "run.start"]);
  });

  it("[CLI-COMMANDS-29] 模板不存在：TEMPLATE_NOT_FOUND，退出码 3", async () => {
    const { h } = harness({
      "playground.create": () => {
        throw clientError("TEMPLATE_NOT_FOUND", { template: "nope" }, "no template");
      },
    });
    const result = await h.run(["new", "nope", "demo", "--json"]);
    expect(result.code).toBe(3);
    expect(h.json(result).error).toMatchObject({
      code: "TEMPLATE_NOT_FOUND",
      data: { template: "nope" },
    });
  });

  it("[CLI-COMMANDS-30] 变量：k=v 原样交给管理进程；写法不对或键是 name 报 VAR_INVALID，不发任何请求", async () => {
    const { h, calls } = harness({ "playground.create": created() });
    const ok = await h.run([
      "new",
      "tpl",
      "demo",
      "--var",
      "title=Hello",
      "--var",
      "a=b=c",
      "--json",
    ]);
    expect(ok.code).toBe(0);
    expect(calls[0]?.params.vars).toEqual({ title: "Hello", a: "b=c" });
    calls.length = 0;

    for (const bad of ["title", "name=x"]) {
      const result = await h.run(["new", "tpl", "demo", "--var", bad, "--json"]);
      expect(result.code).toBe(2);
      expect(h.json(result).error).toMatchObject({
        code: "VAR_INVALID",
        data: { key: bad.split("=")[0] },
      });
    }
    // 没有声明的键由管理进程判断，错误原样冒出来
    const undeclared = harness({
      "playground.create": () => {
        throw clientError("VAR_INVALID", { key: "color" }, "not declared");
      },
    });
    const result = await undeclared.h.run(["new", "tpl", "demo", "--var", "color=red", "--json"]);
    expect(result.code).toBe(2);
    expect(undeclared.h.json(result).error).toMatchObject({ data: { key: "color" } });
    expect(calls).toEqual([]);
  });

  it("[CLI-COMMANDS-31] 已存在时默认 fail：NAME_EXISTS 退出码 9，hint 提到 --if-exists reuse", async () => {
    const { h, calls } = harness({
      "playground.create": () => {
        throw clientError("NAME_EXISTS", { name: "demo" }, "exists");
      },
    });
    const result = await h.run(["new", "react19", "demo", "--json"]);
    expect(result.code).toBe(9);
    const error = h.json(result).error as { code: string; hint: string };
    expect(error.code).toBe("NAME_EXISTS");
    expect(error.hint).toContain("--if-exists reuse");
    expect(calls[0]?.params.ifExists).toBe("fail");
  });

  it("--if-exists reuse 交给管理进程，已有项目沿用", async () => {
    const { h, calls } = harness({
      "playground.create": () => ({ playground: playground(), created: false }),
    });
    const result = await h.run(["new", "react19", "demo", "--if-exists", "reuse", "--json"]);
    expect(h.json(result).created).toBe(false);
    expect(calls[0]?.params.ifExists).toBe("reuse");
    const bad = await h.run(["new", "react19", "demo", "--if-exists", "maybe", "--json"]);
    expect(bad.code).toBe(2);
  });

  it("[CLI-COMMANDS-32] [LIBRARY-PLAYGROUNDS-03] 创建后启动失败：TOOL_MISSING 退出码 4，创建已经完成，hint 写出重跑命令", async () => {
    const { h, calls } = harness({
      "playground.create": created({ name: "hello" }),
      "run.start": () => {
        throw clientError(
          "TOOL_MISSING",
          { tool: "go", required: ">=1.26", name: "hello" },
          "no go",
        );
      },
    });
    const result = await h.run(["new", "go", "hello", "--run", "--json"]);
    expect(result.code).toBe(4);
    const error = h.json(result).error as { code: string; hint: string };
    expect(error.code).toBe("TOOL_MISSING");
    expect(error.hint).toContain("runyard run hello");
    expect(names(calls)).toEqual(["playground.create", "run.start"]);
  });

  it("[CLI-COMMANDS-06] 创建时的提示放进 notices", async () => {
    const { h } = harness({
      "playground.create": () => ({
        playground: playground(),
        created: true,
        notices: [{ code: "PATH_NEAR_LIMIT", params: { length: 240, limit: 255 } }],
      }),
    });
    const result = await h.run(["new", "react19", "demo", "--json"]);
    expect(h.json(result).notices).toEqual([
      { code: "PATH_NEAR_LIMIT", params: { length: 240, limit: 255 } },
    ]);
  });

  it("[LIBRARY-AUTO-CLEAN-01] 默认已保留", async () => {
    const { h, calls } = harness({ "playground.create": created() });
    const result = await h.run(["new", "react19", "demo", "--json"]);
    expect(h.json(result).retention).toBe("kept");
    expect(calls[0]?.params).not.toHaveProperty("autoClean");
  });

  it("[LIBRARY-AUTO-CLEAN-02] --clean-after 30d 打开自动清理", async () => {
    const { h, calls } = harness({
      "playground.create": created({ autoClean: { enabled: true, days: 30 } }),
    });
    const result = await h.run(["new", "react19", "demo", "--clean-after", "30d", "--json"]);
    expect(h.json(result).retention).toBe("autoClean");
    expect(calls[0]?.params.autoClean).toBe(30);
  });

  it("[LIBRARY-AUTO-CLEAN-03] 写法不对的天数报 USAGE，不创建", async () => {
    const { h, calls } = harness({ "playground.create": created() });
    for (const value of ["30", "0d", "-1d", "2w", "1.5d", "d"]) {
      const result = await h.run(["new", "react19", "demo", "--clean-after", value, "--json"]);
      expect(result.code, value).toBe(2);
      expect(h.json(result).error).toMatchObject({ code: "USAGE" });
    }
    expect(calls).toEqual([]);
  });

  it("[LIBRARY-AUTO-CLEAN-04] 智能体创建的项目同样默认已保留", async () => {
    const { h, calls } = harness({ "playground.create": created() });
    const result = await h.run(["new", "react19", "demo", "--json"], {
      RUNYARD_AGENT: "Claude Code",
    });
    expect(h.json(result).retention).toBe("kept");
    expect(calls[0]?.params).not.toHaveProperty("autoClean");
  });
});

describe("创建者", () => {
  async function createdBy(env: Record<string, string>): Promise<CreatedBy> {
    const { h, calls } = harness({ "playground.create": created() });
    await h.run(["new", "html", "demo", "--note", "x", "--json"], env);
    return calls[0]?.params.createdBy as CreatedBy;
  }

  it("[CLI-COMMANDS-33] [LIBRARY-PLAYGROUNDS-02] RUNYARD_AGENT 优先，并记下创建命令", async () => {
    const by = await createdBy({ RUNYARD_AGENT: "My Agent", CLAUDECODE: "1" });
    expect(by).toEqual({ kind: "agent", agent: "My Agent", command: "runyard new html demo" });
  });

  it("[CLI-COMMANDS-34] 已知智能体的环境变量", async () => {
    expect(await createdBy({ CLAUDECODE: "1" })).toMatchObject({
      kind: "agent",
      agent: "Claude Code",
    });
  });

  it("[CLI-COMMANDS-35] 跨工具约定名 AI_AGENT 取原值", async () => {
    expect(await createdBy({ AI_AGENT: "codex/1.2" })).toMatchObject({
      kind: "agent",
      agent: "codex/1.2",
    });
  });

  it("[CLI-COMMANDS-36] 没有任何标记：种类是 cli，没有智能体名", async () => {
    const by = await createdBy({});
    expect(by.kind).toBe("cli");
    expect(by).not.toHaveProperty("agent");
    // CLAUDECODE 不是 1 不算
    expect(await createdBy({ CLAUDECODE: "0" })).toMatchObject({ kind: "cli" });
  });

  it("运行的持有者带同一个智能体名", async () => {
    const { h, calls } = harness({
      "playground.get": () => playground(),
      "run.start": () => serverRun(),
      "logs.read": logs([]),
      "settings.get": settings,
    });
    await h.run(["run", "demo", "--json"], { RUNYARD_AGENT: "Claude Code" });
    expect(calls.find((call) => call.method === "run.start")?.params.owner).toEqual({
      kind: "cli",
      agent: "Claude Code",
      command: "runyard run demo",
    });
  });
});

describe("run", () => {
  const server = (extra: Handlers = {}): Handlers => ({
    "playground.get": () => playground(),
    "run.start": () => serverRun(),
    "logs.read": logs(["listening"]),
    "settings.get": settings,
    ...extra,
  });

  it("[CLI-COMMANDS-38] 脚本等到退出，结果含输出", async () => {
    const { h, calls } = harness({
      "playground.get": () => playground({ name: "hello-py", kind: "oneshot" }),
      "run.start": () => scriptRun(),
      "logs.read": logs(["Hello"], { cursor: "run-2:3" }),
    });
    const result = await h.run(["run", "hello-py", "--json"]);
    expect(result.code).toBe(0);
    expect(h.json(result)).toEqual({
      runId: "run-2",
      name: "hello-py",
      state: "finished",
      kind: "oneshot",
      exitCode: 0,
      durationMs: 41,
      stale: false,
      alreadyRunning: false,
      output: "Hello\n",
      truncated: false,
      cursor: "run-2:3",
    });
    expect(calls.find((call) => call.method === "run.start")?.params).toMatchObject({
      wait: "exit",
    });
  });

  it("[CLI-COMMANDS-39] 脚本以非零退出：SCRIPT_ERRORED 退出码 6，cause 原样带出", async () => {
    const failure = new ClientError({
      code: "SCRIPT_ERRORED",
      params: { name: "hello-py" },
      debug: "exit 1",
      cause: { exitCode: 1, outputTail: "boom\n" },
    });
    const { h } = harness({
      "playground.get": () => playground({ kind: "oneshot" }),
      "run.start": () => {
        throw failure;
      },
    });
    const result = await h.run(["run", "hello-py", "--json"]);
    expect(result.code).toBe(6);
    expect(h.json(result).error).toMatchObject({
      code: "SCRIPT_ERRORED",
      cause: { exitCode: 1, outputTail: "boom\n" },
    });
  });

  it("[CLI-COMMANDS-40] 重复运行：原样返回管理进程给的现有运行，alreadyRunning 为 true", async () => {
    const { h } = harness(server({ "run.start": () => serverRun({ alreadyRunning: true }) }));
    const result = await h.run(["run", "demo", "--json"]);
    expect(h.json(result)).toMatchObject({ runId: "run-1", alreadyRunning: true });
  });

  it("[CLI-COMMANDS-41] --restart：先停止再启动，启动请求不带端口，alreadyRunning 为 false", async () => {
    const { h, calls } = harness(
      server({
        "run.stop": () => serverRun({ state: "stopped" }),
        "run.start": () => serverRun({ runId: "run-9" }),
      }),
    );
    const result = await h.run(["run", "demo", "--restart", "--json"]);
    expect(names(calls).filter((name) => name.startsWith("run."))).toEqual([
      "run.stop",
      "run.start",
    ]);
    expect(h.json(result)).toMatchObject({ runId: "run-9", alreadyRunning: false });
    expect(calls.find((call) => call.method === "run.start")?.params).not.toHaveProperty("port");
  });

  it("--restart：没有运行可停不算错", async () => {
    const { h } = harness(
      server({
        "run.stop": () => {
          throw clientError("RUN_NOT_FOUND", { runId: "demo" }, "none");
        },
      }),
    );
    expect((await h.run(["run", "demo", "--restart", "--json"])).code).toBe(0);
  });

  it("[CLI-COMMANDS-42] 端口被占用改用别的端口：结果带 portFallback，退出码 0", async () => {
    const fallback = { wanted: 7104, reason: "PORT_OCCUPIED" as const };
    const { h } = harness(
      server({
        "run.start": () =>
          serverRun({ port: 7105, url: "http://127.0.0.1:7105", portFallback: fallback }),
      }),
    );
    const result = await h.run(["run", "demo", "--json"]);
    expect(result.code).toBe(0);
    expect(h.json(result)).toMatchObject({ port: 7105, portFallback: fallback });
  });

  it("[CLI-COMMANDS-42] 文字模式下端口回退写成一条提示（标准错误）", async () => {
    const fallback = { wanted: 7104, reason: "PORT_OCCUPIED" as const };
    const { h } = harness(
      server({ "run.start": () => serverRun({ port: 7105, portFallback: fallback }) }),
    );
    const result = await h.run(["run", "demo"]);
    expect(result.stderr).toContain("7104");
    expect(result.stdout).toContain("http://127.0.0.1:7104");
  });

  it("--port 只用于这一次，交给管理进程；写法不对报 USAGE", async () => {
    const { h, calls } = harness(server());
    await h.run(["run", "demo", "--port", "7300", "--json"]);
    expect(calls.find((call) => call.method === "run.start")?.params.port).toBe(7300);
    for (const bad of ["0", "70000", "abc", "1.5", "-3"]) {
      expect((await h.run(["run", "demo", "--port", bad, "--json"])).code, bad).toBe(2);
    }
  });

  it("--port 被占用：PORT_IN_USE 退出码 9", async () => {
    const { h } = harness(
      server({
        "run.start": () => {
          throw clientError("PORT_IN_USE", { port: 7300 }, "in use");
        },
      }),
    );
    const result = await h.run(["run", "demo", "--port", "7300", "--json"]);
    expect(result.code).toBe(9);
    expect(h.json(result).error).toMatchObject({ code: "PORT_IN_USE" });
  });

  it("[CLI-COMMANDS-43] 按路径运行与按名称等价：路径原样交给管理进程查找", async () => {
    const { h, calls } = harness(server());
    await h.run(["run", "/Users/me/Runyard/demo", "--json"]);
    expect(calls.find((call) => call.method === "playground.get")?.params).toEqual({
      playground: "/Users/me/Runyard/demo",
    });
  });

  it("[CLI-COMMANDS-44] 文件夹找不到：FOLDER_MISSING 退出码 3", async () => {
    const { h } = harness(
      server({
        "run.start": () => {
          throw clientError("FOLDER_MISSING", { name: "demo" }, "gone");
        },
      }),
    );
    const result = await h.run(["run", "demo", "--json"]);
    expect(result.code).toBe(3);
    expect(h.json(result).error).toMatchObject({ code: "FOLDER_MISSING" });
  });

  it("[CLI-COMMANDS-02] 项目不存在：PLAYGROUND_NOT_FOUND，退出码 3", async () => {
    const { h, calls } = harness({
      "playground.get": () => {
        throw clientError("PLAYGROUND_NOT_FOUND", { name: "no-such-project" }, "none");
      },
    });
    const result = await h.run(["run", "no-such-project", "--json"]);
    expect(result.code).toBe(3);
    expect(h.json(result)).toEqual({
      error: {
        code: "PLAYGROUND_NOT_FOUND",
        message: expect.stringMatching(/\S/),
        hint: expect.stringMatching(/\S/),
        data: { name: "no-such-project" },
      },
    });
    expect(names(calls)).toEqual(["playground.get"]);
  });

  it("[CLI-COMMANDS-45] 等待超时：--timeout 换成毫秒交给管理进程，READY_TIMEOUT 退出码 7", async () => {
    const { h, calls } = harness(
      server({
        "run.start": () => {
          throw clientError("READY_TIMEOUT", { name: "demo", seconds: 1 }, "timeout");
        },
      }),
    );
    const result = await h.run(["run", "demo", "--timeout", "1", "--json"]);
    expect(result.code).toBe(7);
    expect(calls.find((call) => call.method === "run.start")?.params.timeoutMs).toBe(1000);
    // 进程继续运行：命令行没有发过停止
    expect(names(calls)).not.toContain("run.stop");
  });

  it("--timeout 缺省 60 秒；不是正数报 USAGE", async () => {
    const { h, calls } = harness(server());
    await h.run(["run", "demo", "--json"]);
    expect(calls.find((call) => call.method === "run.start")?.params.timeoutMs).toBe(60_000);
    for (const bad of ["0", "-1", "soon"]) {
      expect((await h.run(["run", "demo", "--timeout", bad, "--json"])).code, bad).toBe(2);
    }
  });

  it("--no-wait：请求 wait 为 none", async () => {
    const { h, calls } = harness(server());
    await h.run(["run", "demo", "--no-wait", "--json"]);
    expect(calls.find((call) => call.method === "run.start")?.params.wait).toBe("none");
  });

  it("[CLI-COMMANDS-78] 停止中的项目再次运行：管理进程等停止完成后给的新运行原样返回", async () => {
    const { h } = harness(
      server({ "run.start": () => serverRun({ runId: "run-new", alreadyRunning: false }) }),
    );
    const result = await h.run(["run", "demo", "--json"]);
    expect(h.json(result)).toMatchObject({ runId: "run-new", alreadyRunning: false });
  });

  it("[CLI-COMMANDS-79] 停止超过时限仍未完成：BUSY 退出码 9，没有再发别的启动请求", async () => {
    const { h, calls } = harness(
      server({
        "run.start": () => {
          throw clientError("BUSY", { name: "demo" }, "stop did not finish");
        },
      }),
    );
    const result = await h.run(["run", "demo", "--json"]);
    expect(result.code).toBe(9);
    expect(h.json(result).error).toMatchObject({ code: "BUSY", data: { name: "demo" } });
    expect(names(calls).filter((name) => name === "run.start")).toHaveLength(1);
  });

  it("一次 run 只发这几个请求：使用时间由管理进程在 run.start 里记，命令行不另发", async () => {
    const { h, calls } = harness(server());
    await h.run(["run", "demo", "--json"]);
    expect(names(calls)).toEqual(["playground.get", "run.start", "logs.read", "settings.get"]);
  });

  it("[CLI-COMMANDS-04] 路径和地址的写法：url 以 http://127.0.0.1: 开头，输出里没有 localhost", async () => {
    const { h } = harness(server());
    const result = await h.run(["run", "demo", "--json"]);
    const json = h.json(result);
    expect(String(json.url).startsWith("http://127.0.0.1:")).toBe(true);
    expect(result.stdout).not.toContain("localhost");
  });

  it("文字模式：说一句就绪地址，脚本的输出原样写出", async () => {
    const { h } = harness(server());
    const text = await h.run(["run", "demo"]);
    expect(text.stdout).toContain("http://127.0.0.1:7104");

    const script = harness({
      "playground.get": () => playground({ kind: "oneshot" }),
      "run.start": () => scriptRun({ name: "demo" }),
      "logs.read": logs(["Hello"]),
    });
    const out = await script.h.run(["run", "demo"]);
    expect(out.stdout).toContain("Hello\n");
    expect(out.stdout).toContain("0");
  });

  it("两种语言下 --json 逐字相同", async () => {
    const { h } = harness(server());
    const en = await h.run(["run", "demo", "--json", "--lang", "en"]);
    const zh = await h.run(["run", "demo", "--json", "--lang", "zh-CN"]);
    expect(en.stdout).toBe(zh.stdout);
  });
});
