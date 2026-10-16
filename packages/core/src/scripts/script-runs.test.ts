import { describe, expect, it } from "vitest";
import {
  at,
  createPrepareHarness,
  type HarnessOptions,
  scriptRunner,
  serverRunner,
} from "../prepare/prepare-harness.test.ts";
import { ScriptRuns } from "./script-runs.ts";

const python = "/fake/bin/python3";
const runArgv = [python, "-u", "main.py"];
const checkArgv = [python, "-c", "check", "main.py"];
const mainPy = at("main.py");

// 脚本现场：main.py 的内容决定检查和运行的剧本（含 SYNTAX 就是语法错）
function setup(options: HarnessOptions & { autoRun?: () => boolean } = {}) {
  const { autoRun = () => true, ...rest } = options;
  const h = createPrepareHarness({ runner: scriptRunner, ...rest });
  const content = () => h.fake.fs.readFile(mainPy);
  h.fake.processes.when(checkArgv, () =>
    content().includes("SYNTAX")
      ? {
          output: [{ atMs: 0, stream: "stderr", data: "SyntaxError: invalid syntax\n" }],
          exit: { afterMs: 5, code: 1 },
        }
      : { exit: { afterMs: 5, code: 0 } },
  );
  h.fake.processes.when(runArgv, () => ({
    output: [{ atMs: 1, stream: "stdout", data: `${content().includes("new") ? "new" : "old"}\n` }],
    exit: {
      afterMs: content().includes("LOOP") ? 30_000 : 20,
      code: content().includes("FAIL") ? 3 : 0,
    },
  }));
  const scripts = new ScriptRuns({
    platform: h.fake.platform,
    clock: h.fake.clock,
    engine: h.engine,
    toolchain: h.toolchain,
    resolve: async () => h.subject,
    autoRunEnabled: async () => autoRun(),
  });
  const write = async (text: string) => {
    h.fake.fs.writeFile(mainPy, text);
    await h.advance(0);
  };
  const outputOf = (runId: string) =>
    h.logs
      .filter((l) => l.runId === runId)
      .flatMap(({ entry }) =>
        entry.kind === "stdout" || entry.kind === "stderr" ? [entry.text] : [],
      );
  const runIds = () => [...new Set(h.states.map((s) => s.run.runId))];
  return { h, scripts, write, outputOf, runIds };
}

// 语法检查也是假进程，要推进假时钟它才会退出，所以先发起、再推进、最后取结果
async function startManually(t: ReturnType<typeof setup>) {
  const pending = t.scripts.start(t.h.request());
  await t.h.advance(100);
  return pending;
}

async function started(t: ReturnType<typeof setup>) {
  const result = await startManually(t);
  if (!result.ok) throw new Error("expected the script to start");
  return result.started.run;
}

describe("脚本的运行", () => {
  it("[RUN-SCRIPTS-01] 脚本不经过就绪：checking、running、finished，没有 starting 和 ready，快照没有 port、url、readyMs", async () => {
    const t = setup();
    const run = await started(t);
    expect(t.h.stateNames()).toEqual(["checking", "running", "finished"]);
    const snapshot = run.snapshot();
    expect(snapshot.port).toBeUndefined();
    expect(snapshot.url).toBeUndefined();
    expect(snapshot.readyMs).toBeUndefined();
  });

  it("[RUN-SCRIPTS-02] 退出码 0：finished，exitCode 0，durationMs 有值，输出可读", async () => {
    const t = setup();
    const run = await started(t);
    expect(run.snapshot()).toMatchObject({ state: "finished", exitCode: 0 });
    expect(run.snapshot().durationMs).toBeGreaterThan(0);
    expect(t.outputOf(run.runId)).toEqual(["old"]);
  });

  it("[RUN-SCRIPTS-03] 非零退出码：errored，不是 failed 或 crashed，输出保留", async () => {
    const t = setup();
    await t.write("FAIL");
    const run = await started(t);
    expect(run.snapshot()).toMatchObject({ state: "errored", exitCode: 3 });
    expect(run.error()?.code).toBe("SCRIPT_ERRORED");
    expect(t.outputOf(run.runId)).toEqual(["old"]);
  });

  it("[RUN-SCRIPTS-05] 已出错的脚本修改后再运行：新的 runId，finished", async () => {
    const t = setup();
    await t.write("FAIL");
    const first = await started(t);
    await t.write("ok");
    const second = await started(t);
    expect(second.runId).not.toBe(first.runId);
    expect(second.snapshot().state).toBe("finished");
    expect(t.h.engine.current("pg-1")).toBe(second);
  });

  it("[RUN-SCRIPTS-06] 手动停止不算出错：整棵树结束，stopped", async () => {
    const t = setup();
    await t.write("LOOP");
    const run = await started(t);
    expect(run.state).toBe("running");
    const stopped = run.stop();
    await t.h.advance(3000);
    expect((await stopped).state).toBe("stopped");
    expect(t.h.fake.processes.alive()).toEqual([]);
  });

  it("[RUN-SCRIPTS-21] 脚本正在 running 时手动 run：返回现有运行并带 alreadyRunning，没有重新启动", async () => {
    const t = setup();
    await t.write("LOOP");
    const run = await started(t);
    const again = await t.scripts.start(t.h.request());
    expect(again.ok && again.started.run).toBe(run);
    expect(again.ok && again.started.snapshot.alreadyRunning).toBe(true);
    expect(
      t.h.fake.processes.spawned.filter((s) => s.argv.join(" ") === runArgv.join(" ")),
    ).toHaveLength(1);
  });
});

describe("保存后重新运行", () => {
  async function watching(t: ReturnType<typeof setup>) {
    const run = await started(t);
    const watcher = await t.scripts.watch(t.h.request());
    return { run, watcher };
  }

  it("[RUN-SCRIPTS-08] 默认保存即重跑：新的运行，输出是新内容", async () => {
    const t = setup();
    const { run, watcher } = await watching(t);
    await t.write("new");
    await t.h.advance(500);
    const current = t.h.engine.current("pg-1");
    expect(current?.runId).not.toBe(run.runId);
    expect(t.outputOf(current?.runId ?? "")).toEqual(["new"]);
    await watcher.dispose();
  });

  it("[RUN-SCRIPTS-09] 另一个进程（智能体）直接改磁盘上的文件，效果与应用内保存一致", async () => {
    const t = setup();
    const { watcher } = await watching(t);
    // 不经任何编辑器接口：直接写文件系统，由平台层的文件监听发现
    t.h.fake.fs.writeFile(mainPy, "new");
    await t.h.advance(500);
    expect(t.runIds()).toHaveLength(2);
    await watcher.dispose();
  });

  it("[RUN-SCRIPTS-10] 项目上关闭自动运行：保存不重跑", async () => {
    const t = setup({ autoRun: () => false });
    const { watcher } = await watching(t);
    await t.write("new");
    await t.h.advance(500);
    expect(t.runIds()).toHaveLength(1);
    await watcher.dispose();
  });

  it("[RUN-SCRIPTS-11] 全局设置关闭：保存不重跑；开关每次触发时现读", async () => {
    let enabled = false;
    const t = setup({ autoRun: () => enabled });
    const { watcher } = await watching(t);
    await t.write("new");
    await t.h.advance(500);
    expect(t.runIds()).toHaveLength(1);
    enabled = true;
    await t.write("newer");
    await t.h.advance(500);
    expect(t.runIds()).toHaveLength(2);
    await watcher.dispose();
  });

  it("[RUN-SCRIPTS-12] 关闭自动运行后仍可手动运行，且不改变开关", async () => {
    const enabled = false;
    const t = setup({ autoRun: () => enabled });
    const run = await started(t);
    expect(run.snapshot().state).toBe("finished");
    expect(enabled).toBe(false);
  });

  it("[RUN-SCRIPTS-13] 窗口内连续保存三次只重跑一次", async () => {
    const t = setup();
    const { watcher } = await watching(t);
    await t.write("new 1");
    await t.h.advance(100);
    await t.write("new 2");
    await t.h.advance(100);
    await t.write("new 3");
    await t.h.advance(1000);
    expect(t.runIds()).toHaveLength(2);
    await watcher.dispose();
  });

  it("[RUN-SCRIPTS-14] 被忽略路径（__pycache__）里的变化不触发，不形成循环", async () => {
    const t = setup();
    const { watcher } = await watching(t);
    t.h.fake.fs.mkdir(at("__pycache__"));
    t.h.fake.fs.writeFile(at("__pycache__/main.pyc"), "x");
    t.h.fake.fs.writeFile(at("notes.txt"), "not a python file");
    await t.h.advance(1000);
    expect(t.runIds()).toHaveLength(1);
    await watcher.dispose();
  });

  it("[RUN-SCRIPTS-20] 运行中保存：旧的整棵结束进入 stopped，随后新的 running，任何时刻只有一个脚本进程", async () => {
    const t = setup();
    await t.write("LOOP");
    const run = await started(t);
    const watcher = await t.scripts.watch(t.h.request());
    expect(run.state).toBe("running");
    await t.write("LOOP new");
    let maxAlive = 0;
    for (let i = 0; i < 80; i += 1) {
      await t.h.fake.clock.advance(50);
      const alivePids = new Set(t.h.fake.processes.alive().map((ref) => ref.pid));
      const scriptsAlive = t.h.fake.processes.spawned.filter(
        (spawned) => spawned.argv.join(" ") === runArgv.join(" ") && alivePids.has(spawned.ref.pid),
      );
      maxAlive = Math.max(maxAlive, scriptsAlive.length);
    }
    expect(maxAlive).toBe(1);
    expect(run.state).toBe("stopped");
    const current = t.h.engine.current("pg-1");
    expect(current?.runId).not.toBe(run.runId);
    expect(current?.state).toBe("running");
    const order = t.h.states.map((s) => `${s.run.runId}:${s.run.state}`);
    expect(order.indexOf(`${run.runId}:stopped`)).toBeLessThan(
      order.indexOf(`${current?.runId}:running`),
    );
    await watcher.dispose();
  });
});

describe("语法检查先于重新运行", () => {
  it("[RUN-SCRIPTS-15] 保存了有语法错误的代码：不运行、没有新 runId，快照仍是上一次的 finished 并带 stale，日志里有旧输出和检查输出", async () => {
    const t = setup();
    const run = await started(t);
    const watcher = await t.scripts.watch(t.h.request());
    const before = t.h.states.length;
    await t.write("SYNTAX");
    await t.h.advance(500);
    expect(t.runIds()).toHaveLength(1);
    expect(t.h.engine.current("pg-1")).toBe(run);
    expect(run.snapshot()).toMatchObject({ state: "finished", exitCode: 0, stale: true });
    const event = t.h.states.at(-1);
    expect(event?.run).toMatchObject({ runId: run.runId, state: "finished", stale: true });
    expect(t.h.states.length).toBe(before + 1);
    const output = t.outputOf(run.runId);
    expect(output[0]).toBe("old");
    expect(output.join("\n")).toContain("SyntaxError");
    await watcher.dispose();
  });

  it("[RUN-SCRIPTS-16] 修好之后恢复：产生新的运行，快照不再带 stale", async () => {
    const t = setup();
    const run = await started(t);
    const watcher = await t.scripts.watch(t.h.request());
    await t.write("SYNTAX");
    await t.h.advance(500);
    expect(run.snapshot().stale).toBe(true);
    await t.write("new");
    await t.h.advance(500);
    const current = t.h.engine.current("pg-1");
    expect(current?.runId).not.toBe(run.runId);
    expect(current?.snapshot().stale).toBeUndefined();
    await watcher.dispose();
  });

  it("[RUN-SCRIPTS-17] 手动运行遇到语法错误：不运行，SCRIPT_ERRORED，cause.outputTail 带检查输出", async () => {
    const t = setup();
    await t.write("SYNTAX");
    const result = await startManually(t);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatchObject({
      code: "SCRIPT_ERRORED",
      cause: { outputTail: expect.stringContaining("SyntaxError") },
    });
    expect(t.runIds()).toHaveLength(0);
    expect(t.h.fake.processes.spawned.some((s) => s.argv.join(" ") === runArgv.join(" "))).toBe(
      false,
    );
  });

  it("[RUN-SCRIPTS-19] 运行器没有声明检查：语法错照常运行，以非 0 退出得到 errored，没有 stale", async () => {
    const { check: _check, ...withoutCheck } = scriptRunner;
    const h = createPrepareHarness({ runner: withoutCheck });
    h.fake.processes.when(runArgv, {
      output: [{ atMs: 0, stream: "stderr", data: "SyntaxError\n" }],
      exit: { afterMs: 5, code: 1 },
    });
    const scripts = new ScriptRuns({
      platform: h.fake.platform,
      clock: h.fake.clock,
      engine: h.engine,
      toolchain: h.toolchain,
      resolve: async () => h.subject,
      autoRunEnabled: async () => true,
    });
    h.fake.fs.writeFile(mainPy, "SYNTAX");
    const pending = scripts.start(h.request());
    await h.advance(100);
    const result = await pending;
    expect(result.ok && result.started.run.snapshot()).toMatchObject({
      state: "errored",
      exitCode: 1,
    });
    expect(result.ok && result.started.run.snapshot().stale).toBeUndefined();
  });

  it("语法检查超时按没通过处理，不运行", async () => {
    const t = setup();
    t.h.fake.processes.when(checkArgv, {}); // 一直不退出
    const pending = t.scripts.start(t.h.request());
    await t.h.advance(6000);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(t.h.fake.processes.alive()).toEqual([]);
  });
});

describe("watch.mode = restart（服务）", () => {
  it("文件变化后同一次运行停了再起：ready → reloading → ready，端口不变，只有一个进程", async () => {
    const t = setup({
      runner: {
        ...serverRunner,
        setup: undefined,
        watch: { mode: "restart", paths: ["**/*.js"], debounceMs: 200 },
      },
      registeredPort: 7100,
      requires: { node: { version: ">=22" } },
    });
    t.h.fake.processes.when(["/fake/bin/node", "server.js", "--port", "7100"], {
      listenOn: { port: 7100, atMs: 100 },
      portReleaseDelayMs: 50,
    });
    const { run } = t.h.engine.start(t.h.request());
    await t.h.advance(400);
    expect(run.state).toBe("ready");
    const watcher = await t.scripts.watch(t.h.request());
    t.h.fake.fs.writeFile(at("server.js"), "// changed");
    await t.h.advance(250);
    expect(run.state).toBe("reloading");
    await t.h.advance(1500);
    expect(run.state).toBe("ready");
    expect(run.snapshot().port).toBe(7100);
    expect(run.snapshot().runId).toBe(t.h.states[0]?.run.runId);
    const names = t.h.stateNames();
    expect(names.slice(names.indexOf("reloading") - 1)).toEqual(["ready", "reloading", "ready"]);
    expect(t.h.fake.processes.alive()).toHaveLength(1);
    expect(t.h.fake.processes.spawned.filter((s) => s.argv[1] === "server.js")).toHaveLength(2);
    expect(t.h.exits).toEqual([]); // 旧进程退出不是这次运行的退出
    await watcher.dispose();
  });
});
