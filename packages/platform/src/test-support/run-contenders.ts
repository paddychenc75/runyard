import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { AbsPath } from "../path-types.ts";
import type { TrackedProcesses } from "./tracked-processes.ts";

const CONTENDER = fileURLToPath(new URL("./ipc-contender.ts", import.meta.url));

interface Contender {
  readonly child: ChildProcess;
  readonly lines: string[];
  waitLine(index: number): Promise<string>;
  exited: Promise<void>;
}

function startContender(home: AbsPath, tracker: TrackedProcesses): Contender {
  const child = spawn(process.execPath, [CONTENDER, home], { stdio: ["pipe", "pipe", "inherit"] });
  if (child.pid !== undefined) tracker.track(child.pid);
  const lines: string[] = [];
  const waiters: Array<() => void> = [];
  let buffer = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
      lines.push(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
    }
    for (const waiter of waiters.splice(0)) waiter();
  });
  const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));
  return {
    child,
    lines,
    exited,
    waitLine: (index) =>
      new Promise((resolve) => {
        const check = () => {
          const line = lines[index];
          if (line !== undefined) resolve(line);
          else waiters.push(check);
        };
        check();
      }),
  };
}

export interface Round {
  readonly winners: number;
  readonly losers: readonly string[];
  /** 让赢家正常关闭并等所有进程退出 */
  finish(): Promise<void>;
  /** 强杀赢家，留下残留（socket 文件还在，锁由内核释放） */
  killWinners(): Promise<void>;
}

// 一轮：count 个进程都准备好之后同时开始，收集结果
export async function runRound(
  home: AbsPath,
  count: number,
  tracker: TrackedProcesses,
): Promise<Round> {
  const contenders = Array.from({ length: count }, () => startContender(home, tracker));
  await Promise.all(contenders.map((c) => c.waitLine(0)));
  for (const c of contenders) c.child.stdin?.write("go\n");
  const results = await Promise.all(contenders.map((c) => c.waitLine(1)));
  const winnerIndexes = results.flatMap((r, i) => (r === "WON" ? [i] : []));
  return {
    winners: winnerIndexes.length,
    losers: results.filter((r) => r !== "WON"),
    async finish() {
      for (const c of contenders) c.child.stdin?.end();
      await Promise.all(contenders.map((c) => c.exited));
    },
    async killWinners() {
      for (const i of winnerIndexes) contenders[i]?.child.kill("SIGKILL");
      await Promise.all(contenders.map((c) => c.exited));
    },
  };
}
