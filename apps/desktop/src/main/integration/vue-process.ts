import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import type { Platform, ProcRef } from "@runyard/platform";
import { VUE_LANGUAGE_SERVICE_PATHS as paths } from "../vue-language/service-paths.ts";
import type { LanguageTarget } from "../vue-language/vue-projects.ts";

export interface LanguageProcess {
  write(text: string): void;
  onData(listener: (chunk: Buffer) => void): void;
  onExit(listener: () => void): void;
  stop(): Promise<void>;
  readonly ref: ProcRef;
}
export function languageProcessArgs(
  target: LanguageTarget,
  project: string,
  service: string,
): string[] {
  const tsdk = join(service, paths.tsdk);
  return [
    "--permission",
    `--allow-fs-read=${project}`,
    `--allow-fs-read=${service}`,
    "--require",
    join(service, paths.guard),
    ...(target === "vue"
      ? [join(service, paths.server), "--stdio", `--tsdk=${tsdk}`]
      : [
          join(service, paths.tsserver),
          "--globalPlugins",
          "@vue/typescript-plugin",
          "--pluginProbeLocations",
          service,
          "--disableAutomaticTypingAcquisition",
          "--suppressDiagnosticEvents",
        ]),
  ];
}
export async function launchLanguageProcess(input: {
  target: LanguageTarget;
  project: string;
  service: string;
  executable: string;
  platform: Pick<Platform, "proc">;
  home: string;
  registered?: (ref: ProcRef) => void;
}): Promise<LanguageProcess> {
  const project = await realpath(input.project);
  const service = await realpath(input.service);
  // 不继承 NODE_OPTIONS、代理、插件路径等可注入变量。服务不需要登录 shell 或用户配置。
  const child = spawn(input.executable, languageProcessArgs(input.target, project, service), {
    detached: true,
    cwd: project,
    env: { HOME: input.home, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "pipe",
  });
  let exited = false;
  const exits = new Set<() => void>();
  const done = new Promise<void>((resolve) => {
    const finish = () => {
      if (exited) return;
      exited = true;
      resolve();
      for (const listener of exits) listener();
    };
    child.once("exit", finish);
    child.once("error", finish);
  });
  // stdout 暂停到协议层接好监听，避免初始化之前丢帧。
  child.stdin.on("error", () => {
    /* 退出事件统一拒绝待处理请求。 */
  });
  child.stdout.pause();
  child.stderr.resume();
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  const pid = child.pid;
  const identity = pid === undefined ? null : await input.platform.proc.identity(pid);
  if (!identity || pid === undefined) {
    // 身份查询失败时不能进入平台组清理；尚未回收的本人 ChildProcess 句柄仍归父进程拥有。
    // 不等一个仍运行的孩子自然退出，且不凭一个裸 pid 去结束未知进程。
    if (!exited) child.kill("SIGKILL");
    await done;
    throw new Error("LANGUAGE_PROCESS_EXITED");
  }
  const ref = { pid, startTime: identity.startTime };
  input.registered?.(ref);
  return {
    ref,
    write: (text) => {
      if (exited) throw new Error("LANGUAGE_PROCESS_EXITED");
      child.stdin.write(text);
    },
    onData: (listener) => {
      child.stdout.on("data", listener);
      child.stdout.resume();
    },
    onExit: (listener) => {
      exits.add(listener);
      if (exited) listener();
    },
    stop: async () => {
      if (!exited) await input.platform.proc.terminate(ref, { mode: "kill", graceMs: 0 });
      await done;
    },
  };
}
