// K3 的“内置命令行”入口：由应用自带的运行时执行（ELECTRON_RUN_AS_NODE=1），也能用普通 Node 执行。
// 真正连管理进程的部分直接用 K1 的 cli.mjs 和 client.mjs（打包时原样复制到同一个目录），这里只加：
//   --version、echo-args、exit-with（量启动耗时、测参数和退出码用，不连管理进程）
//   status（只连接不启动，问一次 supervisor.info）
//   installer-stop（安装器的钩子调用：请管理进程退出，技术设计 §8.2）
//   path-add / path-remove（Windows：往用户 PATH 里加、删 bin 目录）
// 为什么 --version 放在最前面、不 import 任何东西：它是“启动一次到底多慢”的下限。
import fs from "node:fs";

const argv = process.argv.slice(2);
const command = argv[0];
const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
// 只输出 ASCII：PowerShell 5.1 会按控制台代码页重新解码管道里的输出，中文会乱；这里要测的是参数有没有传对
const ascii = (s) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

if (command === "--version") {
  const info = JSON.parse(fs.readFileSync(new URL("./build-info.json", import.meta.url), "utf8"));
  process.stdout.write(`runyard ${info.version} (k3 spike)\n`);
  process.exit(0);
}
if (command === "echo-args") {
  process.stdout.write(`${ascii(JSON.stringify({ args: argv.slice(1) }))}\n`);
  process.exit(0);
}
if (command === "exit-with") process.exit(Number(argv[1]));
if (command === "runtime-info") {
  out({ execPath: process.execPath, versions: { node: process.versions.node, electron: process.versions.electron ?? null }, runAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null });
  process.exit(0);
}

const { readSpikeConfig, readBuildInfo } = await import("./k3-pointer.mjs");
const spike = readSpikeConfig();
const build = readBuildInfo();
// 状态目录：命令行参数优先，其次环境变量，最后才是指针文件
const explicit = argv.includes("--state-dir") || process.env.RUNYARD_K1_STATE_DIR;
if (!explicit && !spike) {
  out({ ok: false, code: "NO_SPIKE_ROOT", detail: "没有指针文件，也没有 --state-dir：拒绝运行（绝不落到真实的 ~/.runyard）" });
  process.exit(64);
}
const baseArgs = explicit ? [] : spike.cfgArgs;
const cfgArgs = [...baseArgs, ...(argv.includes("--protocol") ? [] : ["--protocol", String(build.protocol)])];

if (command === "status") {
  const { loadConfig } = await import("./lib/config.mjs");
  const { connectOnce } = await import("./lib/client.mjs");
  const cfg = loadConfig([...argv.slice(1), ...cfgArgs]);
  const r = await connectOnce(cfg, { kind: "cli", clientId: `status-${process.pid}` });
  if (!r.conn) {
    out({ ok: true, running: false, why: r.why ?? r.impostor });
    process.exit(3);
  }
  const info = await r.conn.request("supervisor.info");
  out({ ok: true, running: true, cli: { version: build.version, protocol: build.protocol }, supervisor: info });
  r.conn.close();
  process.exit(0);
}

if (command === "installer-stop") {
  const { stopSupervisorForInstaller } = await import("./k3-installer-helper.mjs");
  const result = await stopSupervisorForInstaller([...argv.slice(1), ...cfgArgs]);
  out(result);
  process.exit(result.gone ? 0 : 1);
}
if (command === "path-add" || command === "path-remove") {
  const { editUserPath } = await import("./k3-installer-helper.mjs");
  const result = editUserPath(command === "path-add" ? "add" : "remove", argv[1]);
  out(result);
  process.exit(result.ok ? 0 : 1);
}

// 其余命令交给 K1 的命令行：它自己读 process.argv，所以把配置参数补在后面
process.argv.push(...cfgArgs);
await import("./cli.mjs");
