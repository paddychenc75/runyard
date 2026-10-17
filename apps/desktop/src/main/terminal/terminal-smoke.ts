import type { Platform } from "@runyard/platform";
import type { TerminalEvents } from "../../shared/terminal.ts";
import type { TerminalService } from "./terminal-service.ts";

// 终端冒烟（pnpm --filter @runyard/desktop smoke:terminal，或打包后的应用加 --terminal-smoke）：
// 不开窗口、不连管理进程，只走一遍主进程终端服务 + pty-host + node-pty：
// 开终端、回显、改大小、前台命令识别、结束后 shell 和后台作业都没留下。
// 打包后的应用上跑，就证明原生模块、spawn-helper 的权限和 asarUnpack 都对（K5 的结论落到实处）。

const STEP_TIMEOUT_MS = 15_000;

export interface SmokeDeps {
  service: TerminalService;
  /** 当项目文件夹用的新建文件夹（终端的工作目录必须是它） */
  folder: string;
  identity: Platform["proc"]["identity"];
  /** 随应用安装的 runyard 启动脚本所在目录（只有打包后的应用有）；有就要求终端里 runyard 解析到它、能运行 */
  expectRunyard: { binDir: string } | null;
  log: (line: string) => void;
  /** 做到一半停住（不结束终端、不退出），留给外面强制结束应用来核对“应用被强制结束后不留进程”（规格 DESKTOP-TERMINAL-32） */
  hold: boolean;
}

/** 收集 terminal.data 事件的小盒子；冒烟里 service 的 emit 接到它 */
export class OutputCollector {
  #text = "";
  readonly #watchers = new Set<() => void>();

  push(event: TerminalEvents["terminal.data"]): void {
    this.#text += event.data;
    for (const watcher of this.#watchers) watcher();
  }

  get text(): string {
    return this.#text;
  }

  /** 等输出里出现这段文字 */
  waitFor(needle: string | RegExp, from = 0): Promise<string> {
    const test = (): string | null => {
      const rest = this.#text.slice(from);
      if (typeof needle === "string") return rest.includes(needle) ? rest : null;
      return needle.test(rest) ? rest : null;
    };
    return new Promise((resolve, reject) => {
      const done = (value: string): void => {
        clearTimeout(timer);
        this.#watchers.delete(check);
        resolve(value);
      };
      const check = (): void => {
        const found = test();
        if (found !== null) done(found);
      };
      const timer = setTimeout(() => {
        this.#watchers.delete(check);
        reject(new Error(`timed out waiting for ${String(needle)}`));
      }, STEP_TIMEOUT_MS);
      this.#watchers.add(check);
      check();
    });
  }
}

export async function runTerminalSmoke(
  deps: SmokeDeps & { collector: OutputCollector },
): Promise<number> {
  const { service, collector, log } = deps;
  const project = "smoke";
  const { folder } = deps;
  const mark = (): number => collector.text.length;
  const send = (data: string): void => service.write(project, data);
  try {
    const snapshot = await service.open(project, { cols: 80, rows: 24 });
    if (snapshot.state.kind !== "running") {
      throw new Error(`terminal did not start: ${JSON.stringify(snapshot.state)}`);
    }
    const shellPid = snapshot.state.pid;
    log(`terminal started pid=${shellPid} shell=${snapshot.state.shell}`);

    let from = mark();
    send("echo SMOKE_$((20+22))_END\r");
    await collector.waitFor(/SMOKE_42_END\r?\n/, from);
    log("echo ok");

    from = mark();
    send("pwd\r");
    await collector.waitFor(folder, from);
    log("working directory ok");

    from = mark();
    service.resize(project, { cols: 100, rows: 30 });
    send("stty size\r");
    await collector.waitFor(/30 100\r?\n/, from);
    log("resize ok");

    from = mark();
    // i18n-allow: 发给 shell 的测试输入（验证 UTF-8 往返），不显示给用户
    send("echo 你好\r");
    await collector.waitFor(/你好\r?\n/, from);
    log("utf-8 ok");

    if (deps.expectRunyard !== null) {
      from = mark();
      send("command -v runyard; runyard --help >/dev/null 2>&1; echo RUNYARD_EXIT=$?\r");
      const seen = await collector.waitFor(/RUNYARD_EXIT=\d+\r?\n/, from);
      if (!seen.includes(`${deps.expectRunyard.binDir}/runyard`)) {
        throw new Error("runyard did not resolve to the launcher shipped with the app");
      }
      if (!/RUNYARD_EXIT=0\r?\n/.test(seen)) throw new Error("runyard --help did not exit 0");
      log("runyard resolves to the app launcher and runs");
    }

    from = mark();
    send("sleep 300 &\r");
    send("echo BGPID=$!=\r");
    const bg = await collector.waitFor(/BGPID=(\d+)=\r?\n/, from);
    const backgroundPid = Number(/BGPID=(\d+)=/.exec(bg)?.[1]);
    const idle = await service.foreground(project);
    if (idle.command !== null) throw new Error(`idle shell reported command ${idle.command}`);
    send("sleep 200\r");
    let running: string | null = null;
    for (let i = 0; i < 30 && running === null; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      running = (await service.foreground(project)).command;
    }
    if (running !== "sleep") throw new Error(`foreground command was ${String(running)}`);
    log("foreground detection ok");

    if (deps.hold) {
      log(`HOLDING shell=${shellPid} background=${backgroundPid}`);
      await new Promise<never>(() => {});
    }

    const began = Date.now();
    await service.end(project, "closed");
    const tookMs = Date.now() - began;
    const leftovers: number[] = [];
    for (const pid of [shellPid, backgroundPid]) {
      if ((await deps.identity(pid)) !== null) leftovers.push(pid);
    }
    if (leftovers.length > 0) throw new Error(`processes left behind: ${leftovers.join(",")}`);
    if (tookMs > 3000) throw new Error(`ending the terminal took ${tookMs} ms`);
    log(`kill ok in ${tookMs} ms, no leftovers (shell ${shellPid}, background ${backgroundPid})`);
    log("TERMINAL SMOKE OK");
    return 0;
  } catch (error) {
    log(`TERMINAL SMOKE FAILED ${String(error)}`);
    return 1;
  } finally {
    await service.dispose().catch(() => undefined);
  }
}
