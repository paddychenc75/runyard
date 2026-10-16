import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRunPreparer,
  parseToolDefinitions,
  type Run,
  type RunClock,
  RunEngine,
  ScriptRuns,
  ToolchainService,
} from "../../packages/core/src/index.ts";
import { absPath, getPlatform } from "../../packages/platform/src/index.ts";
import type { LogEntry, Runner, Template } from "../../packages/protocol/src/index.ts";

// 脚本类内置模板（node-ts、python、go）的冒烟：用真实的平台层、真实的工具链检测和 core 的运行引擎、
// 脚本重跑（ScriptRuns），在系统临时目录里对着本机真正的 node / python3 / go 走一遍：
// 运行 → 保存语法错误（不运行、旧输出还在、标 stale）→ 改正（恢复）→ 不规范格式 → 标准输入 → 运行中停止。
// 不需要网络。数据目录全部在临时主目录里，不碰 ~/.runyard。手动运行：pnpm template:smoke <node-ts|python|go>。
// 它不进 pnpm test：CI 的机器不保证装有够新的 python / go（模板 CI 接入是 issue #54）。

const repoRoot = join(import.meta.dirname, "..", "..");

const realClock: RunClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => Number(setTimeout(callback, ms)[Symbol.toPrimitive]()),
  clearTimeout: (id) => clearTimeout(id),
};

const log = (step: string, detail = ""): void =>
  console.log(`[smoke] ${step}${detail === "" ? "" : `：${detail}`}`);

async function until<T>(what: string, limitMs: number, probe: () => T | undefined): Promise<T> {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    const value = probe();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`等 ${what} 超过 ${limitMs} 毫秒`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// 每个模板用到的几份源码：语法错、不规范格式、读标准输入、一直跑
const programs: Record<string, Record<string, string>> = {
  "node-ts": {
    syntaxError: "const = ;\n",
    enumUse: "enum Color { Red }\nconsole.log(Color.Red);\n",
    fixed: 'const text: string = "fixed";\nconsole.log(text);\n',
    stdin:
      'import { createInterface } from "node:readline";\ncreateInterface({ input: process.stdin }).once("line", (line: string) => {\n  console.log("got:" + line);\n  process.exit(0);\n});\n',
    forever: 'console.log("up");\nsetInterval(() => {}, 1000);\n',
  },
  python: {
    syntaxError: "def broken(:\n",
    fixed: 'print("fixed")\n',
    chinese: 'print("你好，世界")\n',
    stdin: 'print("got:" + input())\n',
    forever: 'import time\nprint("up")\ntime.sleep(1000)\n',
  },
  go: {
    syntaxError: "package main\n\nfunc main( {\n}\n",
    fixed: 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("fixed") }\n',
    messy: 'package main\nimport "fmt"\nfunc   main(){\n      fmt.Println("messy")\n   }\n',
    stdin:
      'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\ts := bufio.NewScanner(os.Stdin)\n\ts.Scan()\n\tfmt.Println("got:" + s.Text())\n}\n',
    forever:
      'package main\n\nimport (\n\t"fmt"\n\t"time"\n)\n\nfunc main() {\n\tfmt.Println("up")\n\ttime.Sleep(time.Hour)\n}\n',
  },
};

function goBuildDirs(): string[] {
  return readdirSync(tmpdir()).filter((name) => name.startsWith("go-build"));
}

export async function smokeScript(id: string): Promise<void> {
  const programsOfId = programs[id];
  if (programsOfId === undefined) throw new Error(`不是脚本类模板：${id}`);
  const templateDir = join(repoRoot, "templates", "builtin", id);
  const template = JSON.parse(readFileSync(join(templateDir, "template.json"), "utf8")) as Template;
  const runner = JSON.parse(
    readFileSync(join(repoRoot, "templates", "runners", template.runner, "runner.json"), "utf8"),
  ) as Runner;
  const code = (name: string): string => programsOfId[name] ?? "";

  const work = mkdtempSync(join(tmpdir(), `runyard-smoke-${id}-`));
  const home = join(work, "home");
  const project = join(work, "project");
  const goDirsBefore = goBuildDirs();
  let watcher: { dispose(): Promise<void> } | undefined;
  const platform = getPlatform({ home: absPath(home) });
  try {
    cpSync(join(templateDir, "files"), project, { recursive: true });
    const entryFile = join(project, template.entry);

    const toolsDir = join(repoRoot, "templates", "tools");
    const { definitions } = parseToolDefinitions(
      readdirSync(toolsDir).map((file) => ({
        file,
        text: readFileSync(join(toolsDir, file), "utf8"),
      })),
    );
    const toolchain = new ToolchainService({
      platform,
      clock: realClock,
      definitions,
      toolPaths: () => ({}),
      onChanged: () => undefined,
    });
    const logs = new Map<string, string[]>();
    const preparer = createRunPreparer({
      platform,
      clock: realClock,
      toolchain,
      definitions,
      resolve: async () => subject,
    });
    const engine = new RunEngine({
      platform,
      clock: realClock,
      readiness: { waitReady: async () => undefined },
      preparer,
      removeDir: async (dir) => {
        rmSync(dir, { recursive: true, force: true }); // delete-allow: 冒烟自己建的 GOTMPDIR
      },
      sinks: {
        state: () => undefined,
        log: (runId: string, entry: LogEntry) => {
          if (entry.kind === "stdout" || entry.kind === "stderr")
            logs.set(runId, [...(logs.get(runId) ?? []), entry.text]);
        },
      },
    });
    const subject = {
      folder: absPath(project),
      runner,
      requires: template.requires,
      entry: template.entry,
      otherRegisteredPorts: new Set<number>(),
    };
    const scripts = new ScriptRuns({
      platform,
      clock: realClock,
      engine,
      toolchain,
      resolve: async () => subject,
      autoRunEnabled: async () => true,
    });
    const request = {
      playgroundId: "smoke",
      name: "smoke",
      kind: runner.kind,
      owner: { kind: "cli", command: "run" },
    } as const;
    const out = (run: Run) => (logs.get(run.runId) ?? []).join("\n");
    const manual = async (): Promise<Run> => {
      const result = await scripts.start(request);
      if (!result.ok)
        throw new Error(`没有运行：${result.error.cause?.outputTail ?? result.error.code}`);
      await result.started.run.waitFor(["finished", "errored", "failed", "stopped", "running"]);
      return result.started.run;
    };
    const finished = async (run: Run): Promise<Run> => {
      await run.waitFor(["finished", "errored", "failed", "stopped"]);
      return run;
    };

    // 1. 模板原样运行
    const first = await finished(await manual());
    assert(
      first.snapshot().state === "finished",
      `首次运行没有结束：${first.state} ${JSON.stringify(first.error())}`,
    );
    assert(first.snapshot().exitCode === 0, "退出码不是 0");
    assert(out(first).includes("Hello"), `输出里没有 Hello：${out(first)}`);
    assert(first.snapshot().port === undefined, "脚本不该有端口");
    log("运行", `${id} 结束，退出码 0，输出 ${JSON.stringify(out(first))}`);

    // 2. 监听保存：语法错误不运行、旧输出还在、标 stale；改正后恢复
    watcher = await scripts.watch(request);
    const seen = new Set<string>([first.runId]);
    const currentId = () => engine.current("smoke")?.runId ?? "";
    writeFileSync(entryFile, code("syntaxError"));
    await until("stale", 20_000, () => (first.snapshot().stale === true ? true : undefined));
    await new Promise((resolve) => setTimeout(resolve, 800));
    assert(currentId() === first.runId && !seen.has("new"), "语法错误之后不该有新的运行");
    assert(out(first).includes("Hello"), "旧输出丢了");
    assert(out(first).length > "Hello, Runyard!".length, "日志里没有检查的输出");
    log(
      "语法错误",
      `没有新的运行，上次结果标 stale，检查输出：${JSON.stringify(out(first).split("\n").slice(-2).join(" | "))}`,
    );
    if (id === "node-ts") {
      writeFileSync(entryFile, code("enumUse"));
      await new Promise((resolve) => setTimeout(resolve, 800));
      assert(currentId() === first.runId, "enum 不该通过检查");
      log("enum", "stripTypeScriptTypes 拒绝，没有运行");
    }
    writeFileSync(entryFile, code("fixed"));
    const second = await until("改正后的新运行", 30_000, () => {
      const run = engine.current("smoke");
      return run !== undefined && run.runId !== first.runId ? run : undefined;
    });
    await finished(second);
    assert(second.snapshot().stale === undefined, "改正后仍带 stale");
    assert(out(second).includes("fixed"), `新运行的输出不对：${out(second)}`);
    log("改正后恢复", `新的运行 ${second.runId} 输出 fixed，不再 stale`);
    await watcher.dispose();
    watcher = undefined;

    // 3. 各语言自己的点
    if (id === "python") {
      writeFileSync(entryFile, code("chinese"));
      const run = await finished(await manual());
      assert(
        run.snapshot().state === "finished" && out(run).includes("你好，世界"),
        `中文输出不对：${out(run)}`,
      );
      assert(!existsSync(join(project, "__pycache__")), "项目里出现了 __pycache__");
      log("Python", "中文输出正常，项目里没有 __pycache__");
    }
    if (id === "go") {
      writeFileSync(entryFile, code("messy"));
      const run = await finished(await manual());
      assert(
        run.snapshot().state === "finished" && out(run).includes("messy"),
        `格式不规范的文件应当通过：${out(run)}`,
      );
      log("Go", "格式不规范但语法正确：检查通过，正常运行");
      writeFileSync(join(project, "go.mod"), "module playground\n\ngo 1.99\n");
      writeFileSync(entryFile, code("fixed"));
      const tooNew = await finished(await manual());
      assert(
        tooNew.snapshot().state === "errored",
        `go.mod 要求更新的 Go 应当 errored：${tooNew.state}`,
      );
      assert(/GOTOOLCHAIN|toolchain/i.test(out(tooNew)), `没有 Go 自己的报错：${out(tooNew)}`);
      writeFileSync(join(project, "go.mod"), "module playground\n\ngo 1.26\n");
      log("Go", "go.mod 要求 1.99：没有下载工具链，errored");
    }

    // 4. 标准输入
    writeFileSync(entryFile, code("stdin"));
    const reading = await manual();
    await until("running", 20_000, () => (reading.state === "running" ? true : undefined));
    assert((await reading.writeStdin("abc")) === "written", "写标准输入失败");
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert(reading.state === "running", "没有换行时不该读到完整的一行");
    await reading.writeStdin("\n");
    await finished(reading);
    assert(out(reading).includes("got:abc"), `没读到输入：${out(reading)}`);
    log("标准输入", "不补换行；补上 \\n 之后读到 abc");

    // 5. 运行中停止
    writeFileSync(entryFile, code("forever"));
    const running = await manual();
    await until("up", 30_000, () => (out(running).includes("up") ? true : undefined));
    const stopped = await running.stop();
    assert(stopped.state === "stopped", `停止后是 ${stopped.state}`);
    log("停止", "stopped");
    if (id === "go") {
      const after = goBuildDirs().filter((name) => !goDirsBefore.includes(name));
      assert(after.length === 0, `系统临时目录里残留 ${after.join(", ")}`);
      const goTmp = join(home, ".runyard", "tmp");
      const leftover = existsSync(goTmp) ? readdirSync(goTmp) : [];
      assert(leftover.length === 0, `GOTMPDIR 残留 ${leftover.join(", ")}`);
      log("Go", "停止后系统临时目录和 GOTMPDIR 里都没有 go-build* 残留");
    }
    log("全部通过", id);
  } finally {
    await watcher?.dispose(); // 出错时也要放掉文件监听，否则进程退不出去
    rmSync(work, { recursive: true, force: true }); // delete-allow: 冒烟自己建的临时目录
  }
}
