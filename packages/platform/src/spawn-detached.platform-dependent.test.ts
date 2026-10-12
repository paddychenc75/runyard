import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPlatform } from "./get-platform.ts";
import { type AbsPath, absPath } from "./path-types.ts";
import type { Platform } from "./platform.ts";
import { makeTempHome } from "./test-support/temp-home.ts";
import {
  isAlive,
  parentPidOf,
  processGroupOf,
  TrackedProcesses,
} from "./test-support/tracked-processes.ts";

// spawnDetached：启动一个与启动者脱钩的进程（决策记录 0005 第 3 条；规格 supervisor/lifecycle）。
// “启动者”是另一个真进程（detached-launcher.ts）：它调用 spawnDetached 后立刻退出，
// 这样才能看到子进程在启动者死后还活着。子进程和启动者都记 pid 加启动时间，收尾时核对后结束。

const exec = promisify(execFile);
const LAUNCHER = fileURLToPath(new URL("./test-support/detached-launcher.ts", import.meta.url));
const tracker = new TrackedProcesses();

let sandbox: ReturnType<typeof makeTempHome>;
let platform: Platform;
let logFile: AbsPath;

beforeEach(() => {
  sandbox = makeTempHome();
  platform = getPlatform({ home: sandbox.home, profile: undefined });
  logFile = absPath(join(sandbox.home, "logs", "supervisor.log"));
});

afterEach(async () => {
  const survivors = await tracker.killAll();
  sandbox.remove();
  expect(survivors).toEqual([]);
});

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 250; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`等不到：${what}`);
}

let lastLauncherPid = 0;

// 让启动者起一个子进程后退出，返回子进程的 pid（已登记）
async function launch(
  childScript: string,
  options: { env?: Record<string, string>; extraArgs?: string[] } = {},
): Promise<number> {
  const running = exec(
    process.execPath,
    [
      LAUNCHER,
      sandbox.home,
      logFile,
      process.execPath,
      "-e",
      childScript,
      ...(options.extraArgs ?? []),
    ],
    {
      env: {
        ...process.env,
        LAUNCHER_ENV_JSON: JSON.stringify(options.env ?? { PATH: process.env.PATH ?? "" }),
      },
    },
  );
  const launcherPid = running.child.pid as number;
  const { stdout } = await running;
  lastLauncherPid = launcherPid;
  const pid = Number(stdout.trim());
  tracker.track(pid);
  return pid;
}

const forever = "setInterval(() => {}, 1000);";

describe("spawnDetached", () => {
  it("[SUPERVISOR-LIFECYCLE-07] 启动者退出之后子进程仍然活着，不再是启动者的孩子", async () => {
    const pid = await launch(forever);
    // launch 返回时启动者已经退出（execFile 等到它结束）
    expect(isAlive(pid)).toBe(true);
    // 通常被 init（1）接管；有的系统有专门收养孤儿的进程，所以只要求“不再是启动者的孩子”
    expect(isAlive(lastLauncherPid)).toBe(false);
    await waitFor(() => parentPidOf(pid) !== lastLauncherPid, "子进程不再属于启动者");
  });

  it("[SUPERVISOR-LIFECYCLE-08] 强杀启动者的整个进程组，子进程仍然活着", async () => {
    // 启动者自己是进程组组长（detached），留着不退出；强杀它的整组，子进程在另一个会话里
    const launcher = spawn(
      process.execPath,
      [LAUNCHER, sandbox.home, logFile, process.execPath, "-e", forever],
      {
        detached: true,
        stdio: ["ignore", "pipe", "inherit"],
        env: { ...process.env, LAUNCHER_STAY: "1", LAUNCHER_ENV_JSON: "{}" },
      },
    );
    const launcherPid = launcher.pid as number;
    tracker.track(launcherPid);
    const childPid = await new Promise<number>((resolve) =>
      launcher.stdout?.once("data", (chunk: Buffer) => resolve(Number(chunk.toString().trim()))),
    );
    tracker.track(childPid);
    expect(processGroupOf(childPid)).toBe(childPid);
    process.kill(-launcherPid, "SIGKILL");
    await new Promise((resolve) => launcher.once("close", resolve));
    expect(isAlive(launcherPid)).toBe(false);
    expect(isAlive(childPid)).toBe(true);
  });

  it("标准输入输出不继承：输出追加到日志文件，输入是空的", async () => {
    const script = `
      process.stdout.write("out-line\\n");
      process.stderr.write("err-line\\n");
      process.stdin.on("end", () => { process.stdout.write("stdin-eof\\n"); setInterval(() => {}, 1000); });
      process.stdin.resume();
    `;
    await launch(script);
    await waitFor(
      () => existsSync(logFile) && readFileSync(logFile, "utf8").includes("stdin-eof"),
      "日志里有输出",
    );
    const log = readFileSync(logFile, "utf8");
    expect(log).toContain("out-line");
    expect(log).toContain("err-line");
  });

  it("工作目录是状态目录，不是启动者的目录", async () => {
    await launch(`process.stdout.write("cwd=" + process.cwd() + "\\n"); ${forever}`);
    await waitFor(
      () => existsSync(logFile) && readFileSync(logFile, "utf8").includes("cwd="),
      "日志里有 cwd",
    );
    const line =
      readFileSync(logFile, "utf8")
        .split("\n")
        .find((l) => l.startsWith("cwd=")) ?? "";
    expect(realpathSync(line.slice(4))).toBe(realpathSync(platform.paths.stateDir));
  });

  it("参数是数组，不经过 shell：带空格和 shell 元字符的参数原样到达", async () => {
    const weird = "a b; echo $HOME `x` \"q\" 'r'";
    await launch(`process.stdout.write("arg=" + process.argv[1] + "\\n"); ${forever}`, {
      extraArgs: [weird],
    });
    await waitFor(
      () => existsSync(logFile) && readFileSync(logFile, "utf8").includes("arg="),
      "日志里有参数",
    );
    expect(readFileSync(logFile, "utf8")).toContain(`arg=${weird}\n`);
  });

  it("环境按调用方给的原样传，不多不少（含 ELECTRON_RUN_AS_NODE 由调用方决定）", async () => {
    const script = `process.stdout.write("env=" + JSON.stringify(Object.keys(process.env).sort()) + "\\n"); ${forever}`;
    await launch(script, { env: { ONLY_THIS: "1", ELECTRON_RUN_AS_NODE: "1" } });
    await waitFor(
      () => existsSync(logFile) && readFileSync(logFile, "utf8").includes("env="),
      "日志里有环境",
    );
    const line =
      readFileSync(logFile, "utf8")
        .split("\n")
        .find((l) => l.startsWith("env=")) ?? "";
    // 不同系统可能由运行时补几个变量（如 PWD、_），所以只核对：给的都在，宿主的 PATH 等没有漏进来
    const keys = JSON.parse(line.slice(4)) as string[];
    expect(keys).toEqual(expect.arrayContaining(["ONLY_THIS", "ELECTRON_RUN_AS_NODE"]));
    expect(keys).not.toContain("HOME");
  });

  it("日志文件只有本人可读写（600），它所在的目录不存在时会建出来", async () => {
    await launch(`process.stdout.write("x\\n"); ${forever}`);
    await waitFor(() => existsSync(logFile), "日志文件");
    expect(statSync(logFile).mode & 0o777).toBe(0o600);
  });

  it("命令不存在时抛带代码的错误（INTERNAL），不留下半个进程", async () => {
    const error = await platform.exec
      .spawnDetached([join(sandbox.home, "no-such-binary")], { env: {}, logFile })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ error: { code: "INTERNAL" } });
  });

  it("空参数列表抛 INTERNAL", async () => {
    await expect(platform.exec.spawnDetached([], { env: {}, logFile })).rejects.toMatchObject({
      error: { code: "INTERNAL" },
    });
  });
});
