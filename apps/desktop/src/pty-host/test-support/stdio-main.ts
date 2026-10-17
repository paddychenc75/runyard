import { createInterface } from "node:readline";
import { parseHostCommand } from "../../shared/pty-host-messages.ts";
import { runPtyHost } from "../run.ts";

// 把 pty-host 当成独立的 Node 进程跑，消息走标准输入输出（每行一条 JSON），用来在进程测试里验证
// “后台进程被强制结束”“应用被强制结束”这两种真的进程死亡（utilityProcess 只在 Electron 里有）。
// 用法：node stdio-main.ts <盯着的父进程号>

const parentPid = Number(process.argv[2]);

void runPtyHost(
  {
    send: (event) => void process.stdout.write(`${JSON.stringify(event)}\n`),
    onCommand: (listener) => {
      createInterface({ input: process.stdin }).on("line", (line) => {
        const command = parseHostCommand(JSON.parse(line));
        if (command !== null) listener(command);
      });
    },
    exit: () => process.exit(0),
  },
  { parentPid },
);
