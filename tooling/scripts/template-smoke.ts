import { type ChildProcess, spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateRunner, validateTemplate } from "../../packages/protocol/src/index.ts";

// 内置模板的冒烟：把模板复制到系统临时目录，按运行器 json 真的安装依赖、启动、等 HTTP 响应、
// 改一个源文件看热更新（进程不重启）、再停止并确认端口释放。需要网络（安装依赖），所以不在 pnpm test 里；
// 手动运行：pnpm template:smoke <模板标识> [--node <node 的绝对路径>] [--pm pnpm|npm]
// 在声明范围的下限和上限版本各跑一次时，用 --node 指向那个版本的 node，并让对应的 pnpm 排在 PATH 前面
// （docs/guides/add-template.md）。CI 里的接入是模板 CI 的事（issue #54）。
// 这里只服务本仓库自己的模板冒烟，不是应用里的运行流程：应用的运行走 core 的运行引擎。

const repoRoot = join(import.meta.dirname, "..", "..");

interface Options {
  readonly id: string;
  readonly node: string;
  readonly pm: "pnpm" | "npm";
}

function parseArgs(argv: readonly string[]): Options {
  const [id, ...rest] = argv;
  if (id === undefined || id.startsWith("--"))
    throw new Error("用法：pnpm template:smoke <模板标识> [--node <路径>] [--pm pnpm|npm]");
  let node = process.execPath;
  let pm: "pnpm" | "npm" = "pnpm";
  for (let i = 0; i < rest.length; i += 2) {
    const value = rest[i + 1];
    if (value === undefined) throw new Error(`${rest[i]} 后面要给值`);
    if (rest[i] === "--node") node = value;
    else if (rest[i] === "--pm" && (value === "pnpm" || value === "npm")) pm = value;
    else throw new Error(`不认识的参数 ${rest[i]} ${value}`);
  }
  return { id, node, pm };
}

function log(step: string, detail = ""): void {
  console.log(`[smoke] ${step}${detail === "" ? "" : `：${detail}`}`);
}

function tail(text: string): string {
  return text.split("\n").slice(-15).join("\n");
}

// 跑一条命令到退出；不经 shell，参数是数组
function runToExit(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function get(host: string, port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host, port, path, timeout: 2000 }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function until<T>(what: string, limitMs: number, probe: () => Promise<T | undefined>) {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`等 ${what} 超过 ${limitMs} 毫秒`);
}

function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) resolve(child.exitCode);
    else child.once("exit", (code) => resolve(code));
  });
}

function replacePlaceholders(command: readonly string[], values: Record<string, string>): string[] {
  return command.map((word) =>
    word.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all),
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const templateDir = join(repoRoot, "templates", "builtin", options.id);
  const template = validateTemplate(
    JSON.parse(readFileSync(join(templateDir, "template.json"), "utf8")),
  );
  if (template.value === undefined)
    throw new Error("template.json 不合格，先运行 pnpm template:lint");
  const runner = validateRunner(
    JSON.parse(
      readFileSync(
        join(repoRoot, "templates", "runners", template.value.runner, "runner.json"),
        "utf8",
      ),
    ),
  );
  if (
    runner.value?.kind !== "server" ||
    runner.value.setup === undefined ||
    runner.value.run === undefined
  )
    throw new Error("冒烟只支持带安装步骤的服务类运行器");
  const { setup, run, stop } = runner.value;

  const work = mkdtempSync(join(tmpdir(), `runyard-smoke-${options.id}-`));
  let server: ChildProcess | undefined;
  try {
    // 创建项目：复制 files/，只留选定包管理器的锁文件，替换变量
    cpSync(join(templateDir, "files"), work, { recursive: true });
    const otherLock = options.pm === "pnpm" ? "package-lock.json" : "pnpm-lock.yaml";
    rmSync(join(work, otherLock), { force: true }); // delete-allow: 冒烟自己建的临时目录
    for (const file of template.value.substitute ?? []) {
      const path = join(work, file);
      writeFileSync(path, readFileSync(path, "utf8").replaceAll("{{name}}", "smoke"));
    }
    const nodeBin = options.node;
    const env: NodeJS.ProcessEnv = { ...process.env };
    const nodeVersion = (await runToExit(nodeBin, ["--version"], work, env)).output.trim();
    const pmVersion = (await runToExit(options.pm, ["--version"], work, env)).output.trim();
    log("环境", `node ${nodeVersion}，${options.pm} ${pmVersion}，目录 ${work}`);

    const variant = setup.variants[options.pm];
    if (variant === undefined) throw new Error(`运行器没有 ${options.pm} 的安装命令`);
    const [installTool = options.pm, ...installArgs] = variant.command;
    const install = await runToExit(installTool, installArgs, work, env);
    if (install.code !== 0)
      throw new Error(`安装失败（退出码 ${install.code}）\n${tail(install.output)}`);
    log("安装完成", variant.command.join(" "));

    const typecheck = await runToExit(
      nodeBin,
      [join(work, "node_modules", "typescript", "bin", "tsc"), "--noEmit"],
      work,
      env,
    );
    if (typecheck.code !== 0) throw new Error(`类型检查失败\n${tail(typecheck.output)}`);
    log("类型检查通过");
    const build = await runToExit(
      nodeBin,
      [join(work, "node_modules", "vite", "bin", "vite.js"), "build"],
      work,
      env,
    );
    if (build.code !== 0) throw new Error(`构建失败\n${tail(build.output)}`);
    log("构建通过");

    const port = await freePort();
    const [, ...runArgs] = replacePlaceholders(run.command, { port: String(port) });
    log("启动", ["node", ...runArgs].join(" "));
    server = spawn(nodeBin, runArgs, { cwd: work, env, stdio: ["ignore", "pipe", "pipe"] });
    let serverOutput = "";
    server.stdout?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });
    server.stderr?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });
    const pid = server.pid;
    if (pid === undefined) throw new Error("没有拿到进程号");

    const first = await until("首页的 HTTP 响应", 60_000, async () => {
      if (server?.exitCode !== null) throw new Error(`服务提前退出\n${tail(serverOutput)}`);
      return get("127.0.0.1", port, "/").catch(() => undefined);
    });
    if (first.status !== 200 || !first.body.includes("smoke"))
      throw new Error(`首页不对：${first.status}`);
    log("就绪", `GET / 返回 ${first.status}`);

    // 热更新：改源文件，进程号不变，下一次请求拿到新内容
    const source = existsSync(join(work, "src", "App.tsx")) ? "src/App.tsx" : "src/App.vue";
    const sourcePath = join(work, source);
    writeFileSync(sourcePath, readFileSync(sourcePath, "utf8").replace("Clicked", "Pressed"));
    await until("修改后的模块", 20_000, async () => {
      const module = await get("127.0.0.1", port, `/${source}`).catch(() => undefined);
      return module?.body.includes("Pressed") ? true : undefined;
    });
    if (server.exitCode !== null || server.pid !== pid) throw new Error("保存文件后进程变了");
    log("热更新", `${source} 改后进程 ${pid} 未重启，新内容已可取`);

    const onIpv6 = await get("::1", port, "/").then(
      () => true,
      () => false,
    );
    if (onIpv6) throw new Error("服务还监听了 ::1，应该只监听 127.0.0.1");
    log("监听地址", "只在 127.0.0.1");

    // 停止：先请求优雅退出；宽限期过了还在就判失败（强制结束留给本脚本的收尾）
    const stoppedAt = Date.now();
    server.kill("SIGTERM");
    const code = await Promise.race([
      exited(server),
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), stop.graceMs + 3000),
      ),
    ]);
    if (code === "timeout") throw new Error(`SIGTERM 后 ${stop.graceMs + 3000} 毫秒还没退出`);
    await until("端口释放", 3000, async () =>
      get("127.0.0.1", port, "/").then(
        () => undefined,
        () => true,
      ),
    );
    log("停止", `${Date.now() - stoppedAt} 毫秒内退出（退出码 ${code}），端口已释放`);
    server = undefined;
    log("全部通过", options.id);
  } finally {
    if (server !== undefined && server.exitCode === null) server.kill("SIGKILL"); // 只结束本脚本自己起的子进程
    if (server !== undefined) await exited(server);
    rmSync(work, { recursive: true, force: true }); // delete-allow: 冒烟自己建的临时目录
  }
}

main().catch((error: unknown) => {
  console.error(`[smoke] 失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
