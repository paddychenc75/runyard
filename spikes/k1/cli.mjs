// 最小的“命令行”：一次性进程，连上（或拉起）管理进程，发一个请求，打印一行 JSON。
// 也用来扮演“应用”（--kind app --hold）：并发实验里用普通 Node 进程模拟应用的那条长连接。
import crypto from "node:crypto";
import { loadConfig } from "./lib/config.mjs";
import { ensureSupervisor } from "./lib/client.mjs";

const argv = process.argv.slice(2);
const command = argv[0];
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);
const print = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

// 等到约定的时刻再动手，让几个进程尽量同时开始
async function waitUntil(at) {
  const lead = at - Date.now() - 3;
  if (lead > 0) await new Promise((r) => setTimeout(r, lead));
  while (Date.now() < at) {
    // 最后几毫秒空转，定时器的精度不够
  }
}

try {
  const cfg = loadConfig(argv.slice(1));
  const identity = { kind: opt("kind", "cli"), clientId: opt("client-id", crypto.randomUUID()) };
  if (opt("at")) await waitUntil(Number(opt("at")));
  const t0 = Date.now();
  const launch = { via: opt("via"), exec: opt("supervisor-exec"), electron: has("supervisor-electron") ? true : undefined };
  const { conn, started, notice, timings } = await ensureSupervisor(cfg, identity, { launch, noLaunch: has("no-launch"), startTimeoutMs: Number(opt("start-timeout-ms", 15000)) });
  const base = { ok: true, started, notice, supervisorPid: conn.welcome.pid, instanceId: conn.welcome.instanceId, launcher: conn.welcome.launcher, protocol: conn.welcome.protocol, ensureMs: Date.now() - t0, timings };
  let result;
  if (command === "run") {
    result = await conn.request("run.start", {
      argv: JSON.parse(opt("argv")),
      cwd: opt("cwd", cfg.stateDir),
      port: Number(opt("port")),
      owner: opt("owner", "cli") === "tab" ? { kind: "tab", tabId: "t1" } : { kind: "cli" },
    });
  } else if (command !== "ensure") {
    // 其余命令直接当方法名：supervisor.info、run.list、run.stopAll、supervisor.shutdown、session.bye
    result = await conn.request(command, JSON.parse(opt("params", "{}")));
  }
  print({ ...base, result });
  if (has("hold")) {
    // 一直连着，直到标准输入关闭（正常离开，先道别）或被杀
    process.stdin.resume();
    process.stdin.on("end", async () => {
      if (!has("no-bye")) await conn.request("session.bye").catch(() => {});
      process.exit(0);
    });
  } else {
    conn.close();
  }
} catch (err) {
  print({ ok: false, code: err.code ?? "INTERNAL", detail: err.detail ?? String(err.stack) });
  process.exitCode = 2;
}
