import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { absPath } from "../path-types.ts";
import { isPlatformError } from "../platform-error.ts";
import type { ContractContext } from "./context.ts";
import { ProcessLedger } from "./process-ledger.ts";
import { eventually, startTree, WAIT_MS } from "./service-harness.ts";

// exec 的契约。起的都是 process.execPath（当前的 node）跑的小脚本，结束时核对没有进程遗留。
export function execProcessContract(ctx: ContractContext): void {
  // 目录名里故意带空格，验证路径里的空格不拆参数（RUN-LIFECYCLE-26）
  const root = realpathSync(mkdtempSync(join(tmpdir(), "runyard exec-")));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const platform = ctx.create(root);
  const cwd = absPath(root);
  const node = process.execPath;
  const baseEnv = { PATH: process.env.PATH ?? "" };

  let ledger: ProcessLedger;
  beforeEach(() => {
    ledger = new ProcessLedger(platform);
  });
  afterEach(async () => {
    expect(await ledger.cleanup(), "测试结束时不应有进程遗留").toEqual([]);
  });

  async function run(argv: string[], env: Record<string, string> = baseEnv) {
    const proc = platform.exec.spawn({ argv, cwd, env, stdin: false });
    ledger.add(proc.ref);
    let out = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    proc.stderr.resume();
    const exit = await proc.exited;
    // 等管道读完：exited 不等管道，但这里要读全输出
    await eventually(() => proc.stdout.readableEnded, WAIT_MS, "stdout 读完");
    return { out, exit, proc };
  }

  describe("exec.which", () => {
    it("在 env 给的 PATH 里找到可执行文件，返回绝对路径", async () => {
      const env = { PATH: dirname(node) };
      expect(await platform.exec.which(basename(node), env, cwd)).toBe(node);
    });

    it("只看传入的 env，不看本进程的 PATH", async () => {
      expect(await platform.exec.which(basename(node), { PATH: "" }, cwd)).toBeNull();
      expect(await platform.exec.which(basename(node), {}, cwd)).toBeNull();
    });

    it("找不到返回 null", async () => {
      expect(await platform.exec.which("runyard-no-such-tool", baseEnv, cwd)).toBeNull();
    });

    it("带目录的名字按 cwd 解析，且要求可执行", async () => {
      const dir = join(root, "bin");
      mkdirSync(dir);
      writeFileSync(join(dir, "tool"), "#!/bin/sh\n");
      chmodSync(join(dir, "tool"), 0o755);
      writeFileSync(join(dir, "plain"), "x");
      chmodSync(join(dir, "plain"), 0o644);
      expect(await platform.exec.which("bin/tool", {}, cwd)).toBe(join(dir, "tool"));
      expect(await platform.exec.which("bin/plain", {}, cwd)).toBeNull();
      expect(await platform.exec.which("bin", {}, cwd)).toBeNull();
    });

    it("目录不算可执行文件", async () => {
      mkdirSync(join(root, "dirtool"), { recursive: true });
      expect(await platform.exec.which("dirtool", { PATH: root }, cwd)).toBeNull();
    });
  });

  describe("exec.spawn", () => {
    it("[RUN-LIFECYCLE-26] 参数原样传递：空格、引号、美元符号、分号都不被 shell 解释", async () => {
      const script = "console.log(JSON.stringify([process.argv.slice(1), process.cwd()]))";
      const args = ["a b", "$HOME", ";echo x", "it's", '"q"', "*", "a\nb"];
      const { out } = await run([node, "-e", script, ...args]);
      expect(JSON.parse(out)).toEqual([args, root]);
    });

    it("[RUN-LIFECYCLE-25] 子进程环境里没有 ELECTRON_RUN_AS_NODE，其余变量原样保留", async () => {
      const script =
        "console.log(JSON.stringify([process.env.ELECTRON_RUN_AS_NODE ?? null, process.env.FOO]))";
      const { out } = await run([node, "-e", script], {
        ...baseEnv,
        ELECTRON_RUN_AS_NODE: "1",
        FOO: "bar",
      });
      expect(JSON.parse(out)).toEqual([null, "bar"]);
    });

    it("子进程环境只有调用方给的，不混入本进程的变量", async () => {
      process.env.RUNYARD_CONTRACT_LEAK = "leak";
      try {
        const { out } = await run([
          node,
          "-e",
          "console.log(process.env.RUNYARD_CONTRACT_LEAK ?? 'none')",
        ]);
        expect(out.trim()).toBe("none");
      } finally {
        delete process.env.RUNYARD_CONTRACT_LEAK;
      }
    });

    it("stdout 和 stderr 分开走各自的管道", async () => {
      const proc = platform.exec.spawn({
        argv: [node, "-e", "console.log('out'); console.error('err')"],
        cwd,
        env: baseEnv,
        stdin: false,
      });
      ledger.add(proc.ref);
      let out = "";
      let err = "";
      proc.stdout.on("data", (c: Buffer) => {
        out += c.toString();
      });
      proc.stderr.on("data", (c: Buffer) => {
        err += c.toString();
      });
      await proc.exited;
      await eventually(
        () => proc.stdout.readableEnded && proc.stderr.readableEnded,
        WAIT_MS,
        "管道读完",
      );
      expect([out.trim(), err.trim()]).toEqual(["out", "err"]);
    });

    it("stdin 为 false 时没有输入管道，为 true 时可写", async () => {
      const without = platform.exec.spawn({
        argv: [node, "-e", ""],
        cwd,
        env: baseEnv,
        stdin: false,
      });
      ledger.add(without.ref);
      expect(without.stdin).toBeNull();
      without.stdout.resume();
      without.stderr.resume();
      await without.exited;

      const withInput = platform.exec.spawn({
        argv: [node, "-e", "process.stdin.pipe(process.stdout)"],
        cwd,
        env: baseEnv,
        stdin: true,
      });
      ledger.add(withInput.ref);
      let echoed = "";
      withInput.stdout.on("data", (c: Buffer) => {
        echoed += c.toString();
      });
      withInput.stderr.resume();
      withInput.stdin?.end("hello");
      await withInput.exited;
      await eventually(() => withInput.stdout.readableEnded, WAIT_MS, "stdout 读完");
      expect(echoed).toBe("hello");
    });

    it("exited 给出退出码；被强行结束时为 null", async () => {
      expect((await run([node, "-e", "process.exit(3)"])).exit).toEqual({ exitCode: 3 });
      const killed = await run([node, "-e", "process.kill(process.pid, 'SIGKILL')"]);
      expect(killed.exit).toEqual({ exitCode: null });
    });

    it("ref 是 pid 加启动时间，与 proc.identity 查到的一致", async () => {
      const proc = platform.exec.spawn({
        argv: [node, "-e", "setTimeout(() => {}, 5000)"],
        cwd,
        env: baseEnv,
        stdin: false,
      });
      ledger.add(proc.ref);
      proc.stdout.resume();
      proc.stderr.resume();
      expect(await platform.proc.identity(proc.ref.pid)).toEqual({ startTime: proc.ref.startTime });
      await platform.proc.terminate(proc.ref, { mode: "kill", graceMs: 0 });
      await proc.exited;
    });

    it("子进程自成进程组：根和后代都在 members 里，别的进程不在", async () => {
      const tree = await startTree(platform, ledger, { children: [{ children: [{}] }] }, cwd);
      expect(await platform.proc.members(tree.proc.ref)).toEqual(
        [...tree.pids].sort((a, b) => a - b),
      );
      await platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 2000 });
    });

    it("[RUN-LIFECYCLE-16] 后代拿着输出管道不放时，exited 照样在根退出后兑现", async () => {
      const tree = await startTree(platform, ledger, { exitAfterMs: 100, children: [{}] }, cwd);
      const exit = await tree.proc.exited;
      expect(exit).toEqual({ exitCode: 0 });
      // 后代还握着写端，管道没有关
      expect(tree.proc.stdout.readableEnded).toBe(false);
      await platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 2000 });
    });

    it("命令不存在或 cwd 不存在时同步抛 PlatformError，不留下未捕获的 error", () => {
      for (const spec of [
        { argv: ["/nonexistent/runyard-tool"], cwd },
        { argv: [node, "-e", ""], cwd: absPath(join(root, "no-such-dir")) },
        { argv: [], cwd },
      ]) {
        try {
          platform.exec.spawn({ ...spec, env: baseEnv, stdin: false });
          expect.unreachable("应当抛错");
        } catch (error) {
          expect(isPlatformError(error)).toBe(true);
        }
      }
    });
  });
}
