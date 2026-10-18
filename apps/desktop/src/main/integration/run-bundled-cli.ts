import { spawn } from "node:child_process";

// 在应用里跑随包命令行（设置页的“导出诊断信息…”等）。
// 不能走 platform.exec.spawn：它为了不让用户项目里的 Electron 程序变成 Node，会删掉 ELECTRON_RUN_AS_NODE，
// 而随包命令行恰恰靠这个变量让 Electron 可执行文件当 Node 用。变量被删后，子进程会把整个应用再启动一份，
// 永远不退出，导出就一直等到失败（#399）。这里直接起进程：参数数组、不经 shell、不继承标准输入。

export interface BundledCliRun {
  code: number;
  stdout: string;
}

export interface BundledCliOptions {
  /** 当前可执行文件（打包后是 Electron 本身） */
  execPath: string;
  /** 命令行入口脚本 */
  entry: string;
  args: string[];
  home: string;
  /** 原样带给子进程的父进程变量；只取 PATH 和 TMPDIR */
  parentEnv: NodeJS.ProcessEnv;
}

export function runBundledCli(options: BundledCliOptions): Promise<BundledCliRun> {
  const { execPath, entry, args, home, parentEnv } = options;
  return new Promise((resolve) => {
    const child = spawn(execPath, [entry, ...args], {
      cwd: home,
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        HOME: home,
        ...(parentEnv.PATH ? { PATH: parentEnv.PATH } : {}),
        ...(parentEnv.TMPDIR ? { TMPDIR: parentEnv.TMPDIR } : {}),
      },
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.once("error", () => resolve({ code: 1, stdout }));
    child.once("close", (code) => resolve({ code: code ?? 1, stdout }));
  });
}
