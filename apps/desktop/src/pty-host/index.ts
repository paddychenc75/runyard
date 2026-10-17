import { parseHostCommand } from "../shared/pty-host-messages.ts";
import { runPtyHost } from "./run.ts";

// pty-host 进程入口（Electron 的 utilityProcess 里运行，技术设计 §6.3）。构建成 dist/pty-host/index.cjs。
// 仓库里只有这个进程会加载 node-pty。

const port = process.parentPort;
if (port === undefined) throw new Error("pty-host must run inside an Electron utilityProcess");

void runPtyHost({
  send: (event) => port.postMessage(event),
  onCommand: (listener) =>
    port.on("message", (message) => {
      const command = parseHostCommand(message.data);
      if (command !== null) listener(command);
    }),
  exit: () => process.exit(0),
});
