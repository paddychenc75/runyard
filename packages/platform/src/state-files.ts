import { type AbsPath, joinPath, posixRelPath } from "./path-types.ts";

// 状态目录里两个会被“启动者”和“管理进程”双方用到的位置（storage.md 第 2 节）。
// 放在平台层是因为 supervisor 写发现文件、client 读它，两个包不许互相导入（layers.json），
// 路径只能有一份定义。

/** 发现文件 run/supervisor.json：含口令，只有本人可读 */
export function discoveryFilePath(stateDir: AbsPath): AbsPath {
  return joinPath(stateDir, posixRelPath("run/supervisor.json"));
}

/** 管理进程日志所在的目录 */
export function supervisorLogDir(stateDir: AbsPath): AbsPath {
  return joinPath(stateDir, posixRelPath("logs"));
}

/** 启动者把管理进程的标准输出和标准错误追加到这里 */
export function supervisorLogPath(stateDir: AbsPath): AbsPath {
  return joinPath(stateDir, posixRelPath("logs/supervisor.log"));
}
