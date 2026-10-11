// 配置：管理进程和客户端都从命令行参数（优先）或环境变量取同一组值。
// 为什么参数优先：Windows 上经 WMI 启动的进程拿不到调用者的环境变量（见 README 的“存活”一节），
// 所以管理进程需要的一切都必须能写在命令行上。
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

export const PRODUCT_VERSION = "0.0.0-k1";

function argValue(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

export function loadConfig(argv = process.argv.slice(2), env = process.env) {
  const pick = (name, envName, fallback) => argValue(argv, name) ?? env[envName] ?? fallback;
  const stateDir = pick("state-dir", "RUNYARD_K1_STATE_DIR");
  if (!stateDir) {
    // 技术验证绝不落到真实的 ~/.runyard 上：没给目录就拒绝运行
    throw new Error("必须用 --state-dir 或 RUNYARD_K1_STATE_DIR 指定一个临时的状态目录");
  }
  const int = (name, envName, fallback) => Number(pick(name, envName, fallback));
  return {
    stateDir: path.resolve(stateDir),
    profile: pick("profile", "RUNYARD_K1_PROFILE", "k1"),
    protocol: int("protocol", "RUNYARD_K1_PROTOCOL", 1),
    // 管理进程一侧：它还愿意服务的最低客户端协议版本
    minClientProtocol: int("min-client", "RUNYARD_K1_MIN_CLIENT", 1),
    // 客户端一侧：它还能用的最低管理进程协议版本
    minServerProtocol: int("min-server", "RUNYARD_K1_MIN_SERVER", 1),
    idleExitMs: int("idle-exit-ms", "RUNYARD_K1_IDLE_EXIT_MS", 60_000),
    graceMs: int("grace-ms", "RUNYARD_K1_GRACE_MS", 5_000),
    // 只给实验用的保险：到时间无条件退出，保证测试泄漏的管理进程不会留在机器上
    maxLifetimeMs: int("max-lifetime-ms", "RUNYARD_K1_MAX_LIFETIME_MS", 0),
    // kernel = 由内核在进程死亡时自动释放的锁（推荐）；naive = 设计原文的“监听即是锁”加删除残留文件
    lockMode: pick("lock", "RUNYARD_K1_LOCK", "kernel"),
    // v1 = 加了域分隔和长度检查的握手；spec = 技术设计 §5.1 的原文
    handshake: pick("hs", "RUNYARD_K1_HS", "v1"),
    launcher: pick("launcher", "RUNYARD_K1_LAUNCHER", process.versions.electron ? "electron" : "node"),
  };
}

// Windows 管道名里的“用户标识”。纯 Node 拿不到 SID（要调 whoami 或原生接口），
// 这里用“域\用户名”的摘要：同一个用户稳定，不同用户不同，名字里也不出现用户名本身。
export function userTag() {
  const info = os.userInfo();
  const who = `${process.env.USERDOMAIN ?? ""}\\${info.username}`.toLowerCase();
  return crypto.createHash("sha256").update(who).digest("hex").slice(0, 16);
}

export function endpointOf(cfg) {
  if (process.platform === "win32") return `\\\\.\\pipe\\runyard-${cfg.profile}-${userTag()}`;
  return path.join(cfg.stateDir, "run", "supervisor.sock");
}

export function pathsOf(cfg) {
  const runDir = path.join(cfg.stateDir, "run");
  const logDir = path.join(cfg.stateDir, "logs");
  return {
    runDir,
    logDir,
    discovery: path.join(runDir, "supervisor.json"),
    lock: path.join(runDir, "supervisor.lock"),
    eventLog: path.join(logDir, "supervisor.jsonl"),
    startsLog: path.join(logDir, "starts.jsonl"),
    outLog: path.join(logDir, "supervisor.out.log"),
  };
}

// 把配置还原成管理进程的命令行参数
export function supervisorArgs(cfg) {
  return [
    "--state-dir", cfg.stateDir,
    "--profile", cfg.profile,
    "--protocol", String(cfg.protocol),
    "--min-client", String(cfg.minClientProtocol),
    "--idle-exit-ms", String(cfg.idleExitMs),
    "--grace-ms", String(cfg.graceMs),
    "--max-lifetime-ms", String(cfg.maxLifetimeMs),
    "--lock", cfg.lockMode,
  ];
}
