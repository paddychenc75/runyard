import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Runner, validateRunner, validateTemplate } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { at, createPrepareHarness } from "../prepare/prepare-harness.test.ts";
import { ScriptRuns } from "./script-runs.ts";

// 用仓库里真实的 node-ts、python-file、go 运行器和 node-ts、python、go 模板的数据，
// 在假平台上跑准备阶段、语法检查和重新运行（规格 templates/runners 的三个脚本运行器）。
// 假进程只决定“检查和脚本退出时说了什么”；检查命令的真实行为（Node 的 stripTypeScriptTypes、ast.parse、
// gofmt）在 tooling/scripts/script-runners.test.ts 和 `pnpm template:smoke` 里对着真工具验证。

const templates = join(import.meta.dirname, "..", "..", "..", "..", "templates");
const read = (path: string): unknown => JSON.parse(readFileSync(join(templates, path), "utf8"));

function load(templateId: string) {
  const template = validateTemplate(read(`builtin/${templateId}/template.json`)).value;
  if (template === undefined) throw new Error(`${templateId} 模板不合格`);
  const runner = validateRunner(read(`runners/${template.runner}/runner.json`)).value;
  if (runner === undefined) throw new Error(`${template.runner} 运行器不合格`);
  return { template, runner };
}

type Kind = "node-ts" | "python" | "go";
const tools = { "node-ts": "node", python: "python3", go: "go" } as const;

function setup(kind: Kind, installed?: { version: string }) {
  const { template, runner } = load(kind);
  const h = createPrepareHarness({ runner, requires: template.requires, entry: template.entry });
  const tool = tools[kind];
  if (installed !== undefined) {
    h.fake.tools.install(tool, {
      version: installed.version,
      ...(kind === "python" ? { versionOutput: `Python ${installed.version}\n` } : {}),
    });
  }
  h.fake.tools.install("gofmt", { version: "0" });
  const scripts = new ScriptRuns({
    platform: h.fake.platform,
    clock: h.fake.clock,
    engine: h.engine,
    toolchain: h.toolchain,
    resolve: async () => h.subject,
    autoRunEnabled: async () => true,
  });
  const entryPath = at(template.entry);
  h.fake.fs.writeFile(entryPath, "ok");
  const runArgv = [`/fake/bin/${tool}`, ...(runner.run?.command.slice(1) ?? [])].map((word) =>
    word === "{entry}" ? template.entry : word,
  );
  const checkArgv = (runner.check?.command ?? []).map((word, index) => {
    if (word === "{entry}") return template.entry;
    return index === 0 ? `/fake/bin/${word === "gofmt" ? "gofmt" : tool}` : word;
  });
  const spawnedLine = (argv: readonly string[]) =>
    h.fake.processes.spawned.filter((s) => s.argv.join("\u0000") === argv.join("\u0000"));
  return { h, runner, template, scripts, entryPath, runArgv, checkArgv, spawnedLine };
}

async function manualStart(t: ReturnType<typeof setup>) {
  const pending = t.scripts.start(t.h.request());
  await t.h.advance(200);
  return pending;
}

const syntaxFailure = (text: string) =>
  ({
    output: [{ atMs: 0, stream: "stderr", data: text }],
    exit: { afterMs: 5, code: 1 },
  }) as const;

describe("三个脚本运行器的数据", () => {
  it("[TEMPLATES-RUNNERS-23] node-ts：node 直接运行入口 .ts，没有加载器和第三方包，模板里没有 node_modules 和 package.json", async () => {
    const t = setup("node-ts");
    t.h.fake.processes.when(t.checkArgv, { exit: { afterMs: 5, code: 0 } });
    t.h.fake.processes.when(t.runArgv, {
      output: [{ atMs: 1, stream: "stdout", data: "ok\n" }],
      exit: { afterMs: 10, code: 0 },
    });
    const result = await manualStart(t);
    expect(result.ok && result.started.run.snapshot()).toMatchObject({
      state: "finished",
      exitCode: 0,
    });
    expect(t.runArgv).toEqual(["/fake/bin/node", "main.ts"]);
    expect(t.spawnedLine(t.runArgv)).toHaveLength(1);
    const files = join(templates, "builtin", "node-ts", "files");
    expect(existsSync(join(files, "node_modules"))).toBe(false);
    expect(existsSync(join(files, "package.json"))).toBe(false);
    expect(t.runner).toMatchObject({
      kind: "oneshot",
      run: { stdin: true },
      watch: { mode: "rerun" },
    });
  });

  it("[TEMPLATES-RUNNERS-24] Node 22.17.0：failed 加 TOOL_TOO_OLD，参数含工具名、范围和当前版本，脚本没有被执行", async () => {
    const t = setup("node-ts", { version: "22.17.0" });
    const result = await manualStart(t);
    expect(result.ok && result.started.run.snapshot().state).toBe("failed");
    expect(result.ok && result.started.run.error()).toMatchObject({
      code: "TOOL_TOO_OLD",
      params: { tool: "node", required: ">=22.18 <27", found: "22.17.0" },
    });
    expect(t.spawnedLine(t.runArgv)).toHaveLength(0);
  });

  it("[TEMPLATES-RUNNERS-25] node-ts 保存了有语法错误的 main.ts：检查用 stripTypeScriptTypes 而不是 node --check，脚本不运行，项目 stale；改正后恢复", async () => {
    const t = setup("node-ts");
    t.h.fake.processes.when(t.checkArgv, () =>
      t.h.fake.fs.readFile(t.entryPath).includes("SYNTAX")
        ? syntaxFailure("ERR_INVALID_TYPESCRIPT_SYNTAX\n")
        : { exit: { afterMs: 5, code: 0 } },
    );
    t.h.fake.processes.when(t.runArgv, { exit: { afterMs: 10, code: 0 } });
    const first = await manualStart(t);
    const run = first.ok ? first.started.run : undefined;
    const watcher = await t.scripts.watch(t.h.request());
    expect(t.checkArgv.join(" ")).toContain("stripTypeScriptTypes");
    expect(t.checkArgv).not.toContain("--check");
    t.h.fake.fs.writeFile(t.entryPath, "SYNTAX");
    await t.h.advance(600);
    expect(t.h.engine.current("pg-1")).toBe(run);
    expect(run?.snapshot()).toMatchObject({ state: "finished", stale: true });
    expect(t.spawnedLine(t.runArgv)).toHaveLength(1);
    t.h.fake.fs.writeFile(t.entryPath, "const ok: number = 1;");
    await t.h.advance(600);
    const current = t.h.engine.current("pg-1");
    expect(current?.runId).not.toBe(run?.runId);
    expect(current?.snapshot().stale).toBeUndefined();
    await watcher.dispose();
  });

  it("[TEMPLATES-RUNNERS-26] python：用 -u 运行，运行环境带 PYTHONUTF8 和 PYTHONUNBUFFERED（中文输出不崩的机制），脚本以 0 结束", async () => {
    const t = setup("python");
    t.h.fake.processes.when(t.checkArgv, { exit: { afterMs: 5, code: 0 } });
    t.h.fake.processes.when(t.runArgv, {
      output: [{ atMs: 1, stream: "stdout", data: "你好，世界\n" }],
      exit: { afterMs: 10, code: 0 },
    });
    const result = await manualStart(t);
    expect(result.ok && result.started.run.snapshot()).toMatchObject({
      state: "finished",
      exitCode: 0,
    });
    expect(t.runArgv).toEqual(["/fake/bin/python3", "-u", "main.py"]);
    const [spawned] = t.spawnedLine(t.runArgv);
    expect(spawned?.env).toMatchObject({ PYTHONUTF8: "1", PYTHONUNBUFFERED: "1" });
    const lines = t.h.logs.flatMap(({ entry }) => (entry.kind === "stdout" ? [entry.text] : []));
    expect(lines).toContain("你好，世界");
  });

  it("[TEMPLATES-RUNNERS-27] python 的检查用 ast.parse 且环境带 PYTHONDONTWRITEBYTECODE=1；语法错以非 0 退出时不运行", async () => {
    const t = setup("python");
    t.h.fake.processes.when(t.checkArgv, () =>
      t.h.fake.fs.readFile(t.entryPath).includes("SYNTAX")
        ? syntaxFailure("SyntaxError: invalid syntax\n")
        : { exit: { afterMs: 5, code: 0 } },
    );
    t.h.fake.processes.when(t.runArgv, { exit: { afterMs: 10, code: 0 } });
    t.h.fake.fs.writeFile(t.entryPath, "SYNTAX");
    const bad = await manualStart(t);
    expect(bad.ok).toBe(false);
    expect(t.spawnedLine(t.runArgv)).toHaveLength(0);
    t.h.fake.fs.writeFile(t.entryPath, "print(1)");
    const good = await manualStart(t);
    expect(good.ok).toBe(true);
    expect(t.checkArgv.join(" ")).toContain("ast.parse");
    for (const spawned of [...t.spawnedLine(t.checkArgv), ...t.spawnedLine(t.runArgv)])
      expect(spawned.env.PYTHONDONTWRITEBYTECODE).toBe("1");
    expect(t.h.fake.fs.exists(at("__pycache__"))).toBe(false);
  });

  it("[TEMPLATES-RUNNERS-28] python 声明接收标准输入：脚本 running 时原样写入", async () => {
    const t = setup("python");
    t.h.fake.processes.when(t.checkArgv, { exit: { afterMs: 5, code: 0 } });
    t.h.fake.processes.when(t.runArgv, {});
    const result = await manualStart(t);
    const run = result.ok ? result.started.run : undefined;
    expect(run?.state).toBe("running");
    expect(await run?.writeStdin("abc\n")).toBe("written");
    expect(t.spawnedLine(t.runArgv)[0]?.stdinText()).toBe("abc\n");
  });

  it("[TEMPLATES-RUNNERS-29] python 的运行不调用 uv，也没有别的包管理命令", async () => {
    const t = setup("python");
    t.h.fake.processes.when(t.checkArgv, { exit: { afterMs: 5, code: 0 } });
    t.h.fake.processes.when(t.runArgv, { exit: { afterMs: 10, code: 0 } });
    await manualStart(t);
    const words = t.h.fake.processes.spawned.map((s) => s.argv.join(" "));
    expect(words.some((line) => /\buv\b|pip|install/.test(line))).toBe(false);
    expect(t.runner.needs).toEqual(["python"]);
  });

  it("[TEMPLATES-RUNNERS-30] Python 3.11.9：failed 加 TOOL_TOO_OLD", async () => {
    const t = setup("python", { version: "3.11.9" });
    const result = await manualStart(t);
    expect(result.ok && result.started.run.error()).toMatchObject({
      code: "TOOL_TOO_OLD",
      params: { tool: "python", found: "3.11.9" },
    });
  });

  it("[TEMPLATES-RUNNERS-31] go：interrupt 停止，GOTMPDIR 每次运行单独一个，停止后删除", async () => {
    const t = setup("go");
    t.h.fake.processes.when(t.checkArgv, { exit: { afterMs: 5, code: 0 } });
    t.h.fake.processes.when(t.runArgv, {});
    const result = await manualStart(t);
    const run = result.ok ? result.started.run : undefined;
    expect(run?.state).toBe("running");
    expect(t.runner.stop).toMatchObject({ mode: "interrupt" });
    expect(t.runArgv).toEqual(["/fake/bin/go", "run", "main.go"]);
    const tempDir = t.spawnedLine(t.runArgv)[0]?.env.GOTMPDIR;
    expect(tempDir).toContain(run?.runId ?? "?");
    const stopped = run?.stop();
    await t.h.advance(4000);
    expect((await stopped)?.state).toBe("stopped");
    expect(t.h.removed).toContain(tempDir);
  });

  it("[TEMPLATES-RUNNERS-32] go 的检查是 gofmt -e -l，退出 2 就是语法错：脚本不运行，项目 stale", async () => {
    const t = setup("go");
    t.h.fake.processes.when(t.checkArgv, () =>
      t.h.fake.fs.readFile(t.entryPath).includes("SYNTAX")
        ? {
            output: [{ atMs: 0, stream: "stderr", data: "main.go:3:1: expected 'IDENT'\n" }],
            exit: { afterMs: 5, code: 2 },
          }
        : { exit: { afterMs: 5, code: 0 } },
    );
    t.h.fake.processes.when(t.runArgv, { exit: { afterMs: 10, code: 0 } });
    const first = await manualStart(t);
    const run = first.ok ? first.started.run : undefined;
    const watcher = await t.scripts.watch(t.h.request());
    t.h.fake.fs.writeFile(t.entryPath, "SYNTAX");
    await t.h.advance(600);
    expect(t.checkArgv.slice(1)).toEqual(["-e", "-l", "main.go"]);
    expect(run?.snapshot()).toMatchObject({ state: "finished", stale: true });
    expect(t.spawnedLine(t.runArgv)).toHaveLength(1);
    await watcher.dispose();
  });

  it("[TEMPLATES-RUNNERS-33] go 格式不规范但语法正确：gofmt 列出文件名但退出 0，视为通过，脚本正常运行", async () => {
    const t = setup("go");
    t.h.fake.processes.when(t.checkArgv, {
      output: [{ atMs: 0, stream: "stdout", data: "main.go\n" }],
      exit: { afterMs: 5, code: 0 },
    });
    t.h.fake.processes.when(t.runArgv, { exit: { afterMs: 10, code: 0 } });
    const result = await manualStart(t);
    expect(result.ok && result.started.run.snapshot().state).toBe("finished");
    expect(t.spawnedLine(t.runArgv)).toHaveLength(1);
  });

  it("[TEMPLATES-RUNNERS-34] go.mod 要求更新的 Go：运行环境关闭了工具链下载，Go 自己的报错以非 0 退出得到 errored", async () => {
    const t = setup("go");
    t.h.fake.env.runDefaults = { GOTOOLCHAIN: "local" };
    t.h.fake.processes.when(t.checkArgv, { exit: { afterMs: 5, code: 0 } });
    t.h.fake.processes.when(t.runArgv, {
      output: [
        {
          atMs: 0,
          stream: "stderr",
          data: "go: go.mod requires go >= 1.99 (running go 1.26.2; GOTOOLCHAIN=local)\n",
        },
      ],
      exit: { afterMs: 5, code: 1 },
    });
    const result = await manualStart(t);
    expect(result.ok && result.started.run.snapshot()).toMatchObject({
      state: "errored",
      exitCode: 1,
    });
    expect(t.spawnedLine(t.runArgv)[0]?.env.GOTOOLCHAIN).toBe("local");
  });

  it("[TEMPLATES-RUNNERS-35] Go 1.25.0：failed 加 TOOL_TOO_OLD，参数里有当前版本", async () => {
    const t = setup("go", { version: "1.25.0" });
    const result = await manualStart(t);
    expect(result.ok && result.started.run.error()).toMatchObject({
      code: "TOOL_TOO_OLD",
      params: { tool: "go", required: ">=1.26 <2", found: "1.25.0" },
    });
    expect(t.spawnedLine(t.runArgv)).toHaveLength(0);
  });

  it("三个运行器都是 oneshot，不写 ready，监听文件变化重跑，检查有超时", () => {
    const runners: Runner[] = ["node-ts", "python", "go"].map((id) => setup(id as Kind).runner);
    for (const runner of runners) {
      expect(runner).toMatchObject({ kind: "oneshot", watch: { mode: "rerun" } });
      expect(runner.ready).toBeUndefined();
      expect(runner.check?.timeoutMs).toBeGreaterThan(0);
    }
  });
});
