import { supervisorLogDir, supervisorLogPath } from "@runyard/platform";
import { unavailable } from "./client-error.ts";
import type { ResolvedOptions } from "./connect-options.ts";

// 拉起管理进程：只经平台层的 spawnDetached（与启动者脱钩，启动者退出、被强杀它都继续活着）。
// 配置全走命令行参数；输出追加到状态目录下的 supervisor.log，工作目录由平台层定为状态目录。
export function launchArguments(ctx: ResolvedOptions): string[] {
  const { platform, client, launch } = ctx;
  return [
    ...launch.command,
    "--home",
    platform.paths.home,
    "--version",
    client.version,
    "--build",
    client.build,
    "--started-by",
    client.kind,
    ...(launch.host === undefined ? [] : ["--host", launch.host]),
    ...(launch.profile === undefined ? [] : ["--profile", launch.profile]),
  ];
}

export async function launchSupervisor(ctx: ResolvedOptions): Promise<void> {
  const { platform, launch } = ctx;
  try {
    await platform.fs.makeDir(supervisorLogDir(platform.paths.stateDir));
    await platform.exec.spawnDetached(launchArguments(ctx), {
      env: launch.env ?? {},
      logFile: supervisorLogPath(platform.paths.stateDir),
    });
  } catch (error) {
    throw unavailable(`could not start the supervisor: ${String(error)}`);
  }
}
