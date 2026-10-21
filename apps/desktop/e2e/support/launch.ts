import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { _electron, type ElectronApplication, expect, type Page } from "@playwright/test";
import { absPath, getPlatform, type Platform, type ProcRef } from "@runyard/platform";
import { type PrepareE2eHome, prepareE2eHome } from "./prepare-home.ts";

// 启动一份真正的桌面应用，所有数据都落在临时主目录里：HOME 指向它，--root 也在它里面，
// 即使 --root 丢了也碰不到真实的 ~/.runyard 和 ~/Runyard。收尾时应用和它拉起的管理进程都按“进程号加启动时间”确认已退出。
// 进程相关的操作（启动命令行、查启动时间、结束进程、按环境变量找进程）一律走平台层，和产品代码同一套规则。

const desktopDir = join(import.meta.dirname, "..", "..");
const cliMain = join(desktopDir, "..", "..", "packages", "cli", "src", "main.ts");
const electronPath = createRequire(join(desktopDir, "package.json"))("electron") as string;

export interface LaunchOptions {
  /** 默认隔离更新联网之后、应用启动之前，专门用例可覆盖自己的临时文件。 */
  prepare?: PrepareE2eHome;
  lang?: "en" | "zh-CN";
  theme?: "light" | "dark" | "system";
}

export interface RunyardApp {
  app: ElectronApplication;
  page: Page;
  home: string;
  root: string;
  /** 资源库文件夹：<root>/Runyard */
  library: string;
  /** 平台层，指向这份临时主目录 */
  platform: Platform;
  /** 调用桌面桥上的方法（界面用的同一条通道） */
  call: <T = unknown>(method: string, param?: unknown) => Promise<T>;
  /** 命令行（缺省是仓库里的 packages/cli，跑打好的包时是包里的启动脚本），同一个临时根目录，返回 --json 的结果 */
  cli: (...args: string[]) => Promise<unknown>;
  /** 像 ⌘Q 一样退出应用，等到应用进程真的没了（管理进程不动） */
  quit: () => Promise<void>;
  /** 收尾：确认应用与管理进程都已不在；不重复调用也安全 */
  shutdown: () => Promise<void>;
}

function stringEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  return { ...env, ...extra };
}

async function gone(platform: Platform, ref: ProcRef): Promise<boolean> {
  const now = await platform.proc.identity(ref.pid);
  // 进程号可能被复用：启动时间对不上就算原来的进程已经没了
  return now === null || now.startTime !== ref.startTime;
}

async function untilGone(platform: Platform, ref: ProcRef, what: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await gone(platform, ref)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${what} (pid ${ref.pid}, start ${ref.startTime}) is still running`);
}

/** 管理进程：从状态文件读进程号，启动时间要和它记的一致才算数（进程号可能被别的进程复用） */
async function supervisorOf(platform: Platform, root: string): Promise<ProcRef | null> {
  try {
    const file = JSON.parse(
      readFileSync(join(root, ".runyard", "run", "supervisor.json"), "utf8"),
    ) as {
      pid: number;
      processStart: number;
    };
    const now = await platform.proc.identity(file.pid);
    return now !== null && now.startTime === file.processStart
      ? { pid: file.pid, startTime: now.startTime }
      : null;
  } catch {
    return null;
  }
}

export async function launchRunyard(options: LaunchOptions = {}): Promise<RunyardApp> {
  // 路径要短：管理进程的 unix 套接字路径有长度上限
  const home = mkdtempSync(join(tmpdir(), "rye-"));
  const root = join(home, "r");
  await prepareE2eHome({ home, root }, options.prepare);
  const platform = getPlatform({ home: absPath(home) });
  // 缺省跑源码构建（dist/main）；设了 RUNYARD_E2E_APP 就跑打好的包（CI 用，--e2e 构建，保留 nodeCliInspect）
  const packaged = process.env.RUNYARD_E2E_APP;
  const args = packaged === undefined ? [join(desktopDir, "dist", "main", "index.mjs")] : [];
  args.push("--root", root, "--lang", options.lang ?? "en", "--theme", options.theme ?? "light");
  const app = await _electron.launch({
    executablePath: packaged ?? electronPath,
    args,
    env: stringEnv({ HOME: home }),
  });
  const electronProcess = app.process();
  let expectedExit = false;
  let unexpectedClose = false;
  app.once("close", () => {
    if (!expectedExit) {
      unexpectedClose = true;
      console.error(
        "RUNYARD_E2E_UNEXPECTED_CLOSE",
        JSON.stringify({
          pid: electronProcess.pid,
          code: electronProcess.exitCode,
          signal: electronProcess.signalCode,
        }),
      );
    }
  });
  // #494：初始预览等待中退出时保留真实退出码/信号，不把 target closed 当作具体根因。
  electronProcess.once("exit", (code, signal) => {
    if (unexpectedClose || !expectedExit)
      console.error("RUNYARD_E2E_UNEXPECTED_EXIT", JSON.stringify({ code, signal }));
  });
  const appPid = electronProcess.pid ?? 0;
  const appIdentity = await platform.proc.identity(appPid);
  if (appIdentity === null) throw new Error("the app is not running right after launch");
  const appRef: ProcRef = { pid: appPid, startTime: appIdentity.startTime };
  const page = await app.firstWindow();

  const exited = new Promise<void>((resolve) => electronProcess.once("exit", () => resolve()));
  const quit = async (): Promise<void> => {
    expectedExit = true;
    // ⌘Q 走的是同一条退出流程；不等它返回，只等进程退出
    void app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => undefined);
    await Promise.race([
      exited,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("the app did not quit within 15 s")), 15_000),
      ),
    ]);
  };

  let finished = false;
  const shutdown = async (): Promise<void> => {
    if (finished) return;
    finished = true;
    expectedExit = true;
    // 先记下管理进程（应用退出后状态文件还在，但进程可能已经没了）
    const supervisor = await supervisorOf(platform, root);
    let stuck = false;
    await Promise.race([
      app.close().catch(() => undefined),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          stuck = true;
          resolve();
        }, 15_000),
      ),
    ]);
    // 退不掉就强制结束，保证不留进程，但这次测试算失败
    if (stuck && !(await gone(platform, appRef))) {
      await platform.proc.terminate(appRef, { mode: "kill", graceMs: 0 });
    }
    await untilGone(platform, appRef, "app");
    if (supervisor !== null && !(await gone(platform, supervisor))) {
      await platform.proc.terminate(supervisor, { mode: "graceful", graceMs: 5000 });
      await untilGone(platform, supervisor, "supervisor");
    }
    if (home.startsWith(tmpdir()) && home.includes("rye-"))
      rmSync(home, { recursive: true, force: true });
    if (stuck) throw new Error("the app did not quit within 15 s and was killed");
  };

  const call = <T>(method: string, param?: unknown): Promise<T> =>
    page.evaluate(
      ([m, p]) =>
        (
          window as unknown as { runyard: { call: (m: string, p: unknown) => Promise<unknown> } }
        ).runyard.call(m as string, p),
      [method, param] as const,
    ) as Promise<T>;

  // 打好的包用包里的命令行（版本对得上，否则管理进程会被源码版的命令行换掉）；源码构建用仓库里的命令行
  const cliArgv =
    packaged === undefined
      ? [process.execPath, cliMain]
      : [join(dirname(packaged), "..", "Resources", "bin", "runyard")];
  const cli = async (...cliArgs: string[]): Promise<unknown> => {
    const child = platform.exec.spawn({
      argv: [...cliArgv, ...cliArgs, "--root", root, "--json"],
      cwd: absPath(home),
      env: stringEnv({ HOME: home }),
      stdin: false,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    const result = await child.exited;
    if (result.exitCode !== 0)
      throw new Error(`runyard ${cliArgs.join(" ")} exited with ${result.exitCode}: ${out}${err}`);
    return JSON.parse(out);
  };

  try {
    await expect(page.locator("[data-sidebar]")).toBeVisible();
    await expect(page.locator("[data-window-toolbar]")).toBeVisible();
  } catch (error) {
    try {
      await shutdown();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "startup and cleanup failed");
    }
    throw error;
  }
  return {
    app,
    page,
    home,
    root,
    library: join(root, "Runyard"),
    platform,
    call,
    cli,
    quit,
    shutdown,
  };
}
