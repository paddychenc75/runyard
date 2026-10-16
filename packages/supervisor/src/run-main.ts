import { fileURLToPath } from "node:url";
import { absPath, getPlatform, isPlatformError } from "@runyard/platform";
import { PROTOCOL_VERSION } from "@runyard/protocol";
import { parseSupervisorArgs } from "./parse-args.ts";
import { startSupervisor } from "./start-supervisor.ts";
import type { TemplateDataDirs } from "./supervisor-options.ts";

// 入口的逻辑。结果用退出码表示（真实启动时由 client 的启动者解读，#44）：
//  0  正常退出（空闲、收到关闭请求、收到终止信号），或者已经有另一个管理进程持有锁（BUSY，安静退出，不是错误）
//  1  启动失败（路径过长、磁盘错误等），原因写到标准错误
//  2  命令行参数不对
export const EXIT_ALREADY_RUNNING_LINE = "supervisor already running";

// 给开发者看的英文诊断行，进启动者指定的日志文件，不会显示给用户（用户看到的文字只来自 i18n）
function diagnostic(line: string): void {
  // i18n-allow: 管理进程的标准错误只进日志文件，从不显示给用户
  process.stderr.write(`${line}\n`);
}

// 开发时模板数据就在仓库的 templates/ 下（与命令行的组合根一致）；打包后的位置等桌面应用的打包 issue 定
function templateDataDirs(): TemplateDataDirs {
  const at = (name: string) =>
    absPath(fileURLToPath(new URL(`../../../templates/${name}`, import.meta.url)));
  return { builtinDir: at("builtin"), runnersDir: at("runners"), toolsDir: at("tools") };
}

export async function runSupervisorMain(argv: readonly string[]): Promise<number> {
  const defaultHost = process.versions.electron === undefined ? "node" : "electron";
  const parsed = parseSupervisorArgs(argv, defaultHost);
  if (!parsed.ok) {
    diagnostic(`usage error: ${parsed.problem}`);
    return 2;
  }
  const { args } = parsed;
  // 新建的文件从创建起就只有本人可访问（发现文件、日志、socket）
  process.umask(0o077);
  // 信号处理要在启动之前就挂上：发现文件一写好就可能有人发终止信号，晚挂会让默认行为直接杀掉进程，留下残留
  let stopRequested = false;
  let stopNow: (() => void) | undefined;
  const requestStop = () => {
    stopRequested = true;
    stopNow?.();
  };
  process.on("SIGTERM", requestStop);
  process.on("SIGINT", requestStop);
  try {
    const platform = getPlatform({ home: absPath(args.home), profile: args.profile });
    const handle = await startSupervisor({
      platform,
      identity: {
        protocol: PROTOCOL_VERSION,
        minClientProtocol: PROTOCOL_VERSION,
        version: args.version,
        build: args.build,
        startedBy: args.startedBy,
      },
      templateData: templateDataDirs(),
      host: args.host,
      execPath: process.execPath,
      log: diagnostic,
    });
    stopNow = () => void handle.api.shutdown("user");
    if (stopRequested) stopNow();
    await handle.closed;
    return 0;
  } catch (error) {
    if (isPlatformError(error) && error.error.code === "BUSY") {
      diagnostic(EXIT_ALREADY_RUNNING_LINE);
      return 0;
    }
    const text = isPlatformError(error)
      ? `${error.error.code}: ${error.error.debug}`
      : String(error);
    diagnostic(`startup failed: ${text}`);
    return 1;
  }
}
