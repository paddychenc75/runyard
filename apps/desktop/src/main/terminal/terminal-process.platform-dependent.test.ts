import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { absPath, getPlatform } from "@runyard/platform";
import { afterEach, describe, expect, it } from "vitest";
import { killTerminal } from "./kill-terminal.ts";
import { TerminalService } from "./terminal-service.ts";
import { OutputCollector } from "./terminal-smoke.ts";
import { ProcessHostLink, spawnStandIn } from "./test-support/process-host.ts";
import { removeRoot, waitGone } from "./test-support/real-terminals.ts";

// pty-host 作为独立进程时的两种真实死亡（规格 DESKTOP-TERMINAL-26、32）。
// node-pty 的预编译文件只有 macOS 的，见 terminal-real.platform-dependent.test.ts 开头的说明。
const platform = getPlatform();
const onMac = platform.id === "darwin";
const size = { cols: 80, rows: 24 };

const roots: string[] = [];
const hosts: ProcessHostLink[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.crash().catch(() => undefined);
  for (const root of roots.splice(0)) removeRoot(root);
});

function tempRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ry-term-proc-")));
  const home = join(root, "home");
  mkdirSync(home);
  mkdirSync(join(root, "demo"));
  mkdirSync(join(root, "api"));
  roots.push(root);
  return root;
}

function build(root: string, parentPid: number) {
  const host = new ProcessHostLink(platform, parentPid, absPath(root));
  hosts.push(host);
  const output = new OutputCollector();
  const service = new TerminalService({
    launch: () => host,
    folderOf: (id) => join(root, id),
    emit: (event, payload) => {
      if (event === "terminal.data") {
        const data = payload as { project: string; data: string };
        output.push(data);
        service.ack(data.project, data.data.length);
      }
    },
    killTerminal: (target) => killTerminal(platform, target),
    env: { HOME: join(root, "home") },
  });
  return { host, service, output };
}

// 见 #336
describe.skipIf(!onMac)("pty-host 作为独立进程", () => {
  it("[DESKTOP-TERMINAL-26] 负责终端的后台进程被强制结束：两个终端都显示意外结束，shell 和里面的命令不留下，重新打开能用", async () => {
    const root = tempRoot();
    const { host, service, output } = build(root, process.pid);
    const demo = await service.open("demo", size);
    const api = await service.open("api", size);
    if (demo.state.kind !== "running" || api.state.kind !== "running")
      throw new Error("not running");
    service.write("demo", "sh -c 'echo FG=$$=; exec sleep 1000'\r");
    const seen = await output.waitFor(/FG=(\d+)=\r?$/m);
    const foreground = Number(/FG=(\d+)=\r?$/m.exec(seen)?.[1]);

    await host.crash();

    expect((await service.attach("demo")).state).toEqual({ kind: "ended", reason: "host-crashed" });
    expect((await service.attach("api")).state).toEqual({ kind: "ended", reason: "host-crashed" });
    for (const pid of [demo.state.pid, api.state.pid, foreground]) {
      expect(await waitGone(platform, pid, 5000), `process ${pid} left behind`).not.toBeNull();
    }
    // 重新打开：新的后台进程、新的终端
    const reopenedHost = build(root, process.pid);
    const fresh = await reopenedHost.service.open("demo", size);
    expect(fresh.state.kind).toBe("running");
    await service.dispose();
    await reopenedHost.service.dispose();
  });

  it("[DESKTOP-TERMINAL-32] 应用被强制结束：10 秒内终端里的 shell 和前台命令都结束，pty-host 自己也退出", async () => {
    const root = tempRoot();
    const standIn = spawnStandIn(platform, absPath(root));
    const { host, service, output } = build(root, standIn.pid);
    const snapshot = await service.open("demo", size);
    if (snapshot.state.kind !== "running") throw new Error("not running");
    service.write("demo", "sh -c 'echo FG=$$=; exec sleep 1000'\r");
    const seen = await output.waitFor(/FG=(\d+)=\r?$/m);
    const foreground = Number(/FG=(\d+)=\r?$/m.exec(seen)?.[1]);
    expect(await platform.proc.identity(foreground)).not.toBeNull();

    // “应用”被 kill -9：没有任何收尾的机会
    await platform.proc.terminate(standIn, { mode: "kill", graceMs: 0 });

    for (const pid of [snapshot.state.pid, foreground, host.ref.pid]) {
      expect(await waitGone(platform, pid, 10_000), `process ${pid} left behind`).not.toBeNull();
    }
  });
});
