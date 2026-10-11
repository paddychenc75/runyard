// 实验 D：有人抢先占住连接点；另一个系统用户来连接。
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spikeRoot } from "../lib/client.mjs";
import { endpointOf, pathsOf } from "../lib/config.mjs";
import { alive, cleanupState, cli, isWin, newState, nodeExec, SESSION, sleep } from "../lib/harness.mjs";

function startSquatter(cfg, mode, record) {
  const child = spawn(nodeExec, [path.join(spikeRoot, "fixtures", "squatter.mjs"), endpointOf(cfg), mode, record], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let err = "";
  child.stderr.on("data", (d) => (err += d));
  const ready = new Promise((resolve) => {
    child.stdout.once("data", () => resolve({ listening: true }));
    child.once("exit", () => resolve({ listening: false, error: err.slice(0, 300) }));
  });
  return { child, ready };
}

// 冒充者先占住连接点，然后客户端来“连不上就启动”。
// discovery：none = 没有发现文件；stale = 留着一份带口令的发现文件（真的管理进程死了，名字被别人占了）
async function squatCase({ mode, discovery, hs, launch }) {
  const cfg = newState("sq", { handshake: hs });
  const p = pathsOf(cfg);
  fs.mkdirSync(p.runDir, { recursive: true, mode: 0o700 });
  const token = crypto.randomBytes(32);
  if (discovery === "stale") {
    fs.writeFileSync(p.discovery, JSON.stringify({ formatVersion: 1, pid: 0, instanceId: "dead", endpoint: endpointOf(cfg), token: token.toString("base64"), protocol: 1 }), { mode: 0o600 });
  }
  const record = path.join(cfg.stateDir, "squatter-received.bin");
  const squatter = startSquatter(cfg, mode, record);
  try {
    const up = await squatter.ready;
    if (!up.listening) return { mode, discovery, hs, launch, error: `冒充者没能监听：${up.error}` };
    const r = await cli(cfg, "ensure", launch ? [] : ["--no-launch", "--start-timeout-ms", "4000"]);
    await sleep(100);
    const got = fs.existsSync(record) ? fs.readFileSync(record) : Buffer.alloc(0);
    const text = got.toString("latin1");
    return {
      mode,
      discovery,
      hs,
      launch,
      ok: r.ok,
      code: r.code,
      detail: r.ok ? undefined : String(r.detail).slice(0, 120),
      connectedTo: r.ok ? r.launcher : undefined, // 'squatter' = 客户端被骗了；'node' = 连上的是真的管理进程
      ms: r.wallMs,
      bytesSentToSquatter: got.length,
      sentHello: text.includes('"hello"'),
      // 口令的四种写法都查：原始字节、base64、base64url、十六进制
      tokenLeaked: got.includes(token) || [token.toString("base64"), token.toString("base64url"), token.toString("hex")].some((form) => text.includes(form)),
    };
  } finally {
    squatter.child.kill("SIGKILL");
    await cleanupState(cfg);
  }
}

export async function squatter() {
  const cases = [];
  for (const mode of ["silent", "garbage", "fake", "reflect"]) {
    for (const discovery of ["none", "stale"]) {
      cases.push(await squatCase({ mode, discovery, hs: "v1", launch: false }));
      cases.push(await squatCase({ mode, discovery, hs: "v1", launch: true }));
    }
  }
  // 对照：按 §5.1 原文实现的客户端，遇到“反射”的冒充者
  const specReflect = await squatCase({ mode: "reflect", discovery: "stale", hs: "spec", launch: false });
  const specFake = await squatCase({ mode: "fake", discovery: "stale", hs: "spec", launch: false });

  // 反过来：真的管理进程已经在了，后来者想在同一个名字上监听
  const cfg = newState("sq2");
  let late;
  try {
    const first = await cli(cfg, "ensure");
    const s = startSquatter(cfg, "silent", path.join(cfg.stateDir, "late.bin"));
    const up = await s.ready;
    s.child.kill("SIGKILL");
    const after = await cli(cfg, "supervisor.info");
    late = { squatterCouldListen: up.listening, squatterError: up.error?.match(/E[A-Z]+/)?.[0], genuineStillReachable: after.ok && after.supervisorPid === first.supervisorPid };
  } finally {
    await cleanupState(cfg);
  }

  // 通过的条件：加固后的握手（v1）在任何情况下都没被骗、口令没出去；
  // 不许启动时一律 SUPERVISOR_UNAVAILABLE；允许启动时，Windows 上仍是 UNAVAILABLE，
  // POSIX 上新的管理进程拿到锁后把冒充者的 socket 换掉（冒充者只能是同一个用户），客户端连上真的。
  const good = (c) => !c.error && !c.tokenLeaked && c.connectedTo !== "squatter" && (c.ok ? !isWin && c.launch && c.connectedTo === "node" : c.code === "SUPERVISOR_UNAVAILABLE") && (c.discovery === "stale" || !c.sentHello);
  return {
    pass: cases.every(good) && !late.squatterCouldListen && late.genuineStillReachable,
    cases,
    unavailableMs: { noLaunch: cases.filter((c) => !c.launch).map((c) => c.ms), withLaunch: cases.filter((c) => c.launch && !c.ok).map((c) => c.ms) },
    lateSquatter: late,
    specHandshake: {
      // true = §5.1 原文的算法被反射骗过（客户端以为连上了管理进程）
      fooledByReflection: specReflect.ok === true && specReflect.connectedTo === "squatter",
      reflect: specReflect,
      fake: specFake,
    },
  };
}

// ---------- 另一个系统用户 ----------

const mode = (file) => {
  try {
    return (fs.statSync(file).mode & 0o777).toString(8).padStart(3, "0");
  } catch {
    return null;
  }
};

function probeAsNobody(nodeForNobody, probe, cfg) {
  try {
    const out = execFileSync("sudo", ["-n", "-u", "nobody", nodeForNobody, probe, endpointOf(cfg), pathsOf(cfg).discovery], { encoding: "utf8", timeout: 15_000 });
    return JSON.parse(out.trim().split("\n").pop());
  } catch (err) {
    return { error: String(err.stderr || err.message).slice(0, 300) };
  }
}

async function otherUserPosix(cfg, p) {
  const modes = { stateDir: mode(cfg.stateDir), runDir: mode(p.runDir), socket: mode(endpointOf(cfg)), discovery: mode(p.discovery), lock: mode(p.lock) };
  if (!process.env.K1_ALLOW_OTHER_USER) {
    // 负责人的 Mac 上不建用户、不用 sudo：只报告权限位，跨用户的真实尝试在 CI 上做
    return { pass: null, measuredCrossUser: false, modes, note: "本机只检查权限位；跨用户连接在 CI（sudo -u nobody）上实测" };
  }
  // nobody 多半进不了检出目录和工具目录：把探测脚本和 node 复制到 /tmp 下带标记的位置
  const probe = `/tmp/${SESSION}-probe.mjs`;
  const nodeCopy = `/tmp/${SESSION}-node`;
  fs.copyFileSync(path.join(spikeRoot, "fixtures", "other-user-probe.mjs"), probe);
  fs.copyFileSync(nodeExec, nodeCopy);
  fs.chmodSync(probe, 0o644);
  fs.chmodSync(nodeCopy, 0o755);
  try {
    const asCreated = probeAsNobody(nodeCopy, probe, cfg);
    fs.chmodSync(p.runDir, 0o755); // 故意放开目录，看 socket 文件自己的权限位挡不挡得住
    const dirOpened = probeAsNobody(nodeCopy, probe, cfg);
    fs.chmodSync(endpointOf(cfg), 0o666); // 再放开 socket：这是对照，证明探测脚本确实连得上
    const allOpened = probeAsNobody(nodeCopy, probe, cfg);
    return {
      pass: asCreated.connect !== "ok" && asCreated.readDiscovery !== "ok" && !asCreated.error && dirOpened.connect !== "ok" && allOpened.connect === "ok" && allOpened.readDiscovery !== "ok",
      measuredCrossUser: true,
      modes,
      asCreated,
      dirOpened_socketStill600: dirOpened,
      control_dir755_socket666: allOpened,
    };
  } finally {
    fs.rmSync(probe, { force: true });
    fs.rmSync(nodeCopy, { force: true });
  }
}

const ps = (script, env = {}) => execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { encoding: "utf8", env: { ...process.env, ...env }, windowsHide: true, timeout: 60_000 });

async function otherUserWindows(cfg, p) {
  const pipeName = endpointOf(cfg).replace("\\\\.\\pipe\\", "");
  const out = { pass: null, measuredCrossUser: false, pipe: endpointOf(cfg) };
  // 管道的访问控制表：纯 Node 建管道时不能指定，这里读出它实际是什么
  try {
    out.acl = ps(
      `$p = New-Object System.IO.Pipes.NamedPipeClientStream('.', '${pipeName}', [System.IO.Pipes.PipeDirection]::InOut); $p.Connect(3000); $a = $p.GetAccessControl(); 'SDDL ' + $a.GetSecurityDescriptorSddlForm('Access,Owner'); $a.Access | ForEach-Object { 'ACE {0} | {1} | {2}' -f $_.IdentityReference, $_.PipeAccessRights, $_.AccessControlType }; $p.Dispose()`,
    ).split(/\r?\n/).filter(Boolean);
  } catch (err) {
    out.acl = `读取失败：${String(err.stderr || err.message).slice(0, 300)}`;
  }
  if (!process.env.K1_ALLOW_OTHER_USER) return { ...out, note: "只在 CI 上新建临时用户实测" };
  const user = `k1u${crypto.randomBytes(3).toString("hex")}`;
  const password = `K1!${crypto.randomBytes(10).toString("hex")}aZ`;
  const dir = `C:\\k1ou-${SESSION}`;
  try {
    fs.mkdirSync(dir);
    execFileSync("icacls", [dir, "/grant", "*S-1-1-0:(OI)(CI)F"], { stdio: "ignore", windowsHide: true });
    fs.copyFileSync(path.join(spikeRoot, "fixtures", "other-user-probe.mjs"), path.join(dir, "probe.mjs"));
    execFileSync("net", ["user", user, password, "/add"], { stdio: "ignore", windowsHide: true });
    out.userCreated = true;
    const script = [
      "$pw = ConvertTo-SecureString $env:K1_PW -AsPlainText -Force",
      "$cred = New-Object System.Management.Automation.PSCredential(($env:COMPUTERNAME + '\\' + $env:K1_USER), $pw)",
      "$proc = Start-Process -FilePath $env:K1_NODE -ArgumentList @($env:K1_PROBE, $env:K1_PIPE, $env:K1_DISC) -Credential $cred -WorkingDirectory $env:K1_DIR -RedirectStandardOutput ($env:K1_DIR + '\\out.txt') -RedirectStandardError ($env:K1_DIR + '\\err.txt') -Wait -PassThru -WindowStyle Hidden",
      "'exit ' + $proc.ExitCode",
    ].join("; ");
    out.startProcess = ps(script, { K1_PW: password, K1_USER: user, K1_NODE: nodeExec, K1_PROBE: path.join(dir, "probe.mjs"), K1_PIPE: endpointOf(cfg), K1_DISC: p.discovery, K1_DIR: dir }).trim();
    const text = fs.readFileSync(path.join(dir, "out.txt"), "utf8").trim();
    out.probe = text ? JSON.parse(text.split(/\r?\n/).pop()) : { error: fs.readFileSync(path.join(dir, "err.txt"), "utf8").slice(0, 400) };
    out.measuredCrossUser = Boolean(out.probe.user);
    // 严格的判定：别的用户连“连接”都建立不了才算通过；能连上但过不了握手的情况单独写明
    if (out.measuredCrossUser) out.pass = out.probe.connect !== "ok" && out.probe.readDiscovery !== "ok";
  } catch (err) {
    out.error = String(err.stderr || err.message).slice(0, 500);
  } finally {
    try {
      if (out.userCreated) execFileSync("net", ["user", user, "/delete"], { stdio: "ignore", windowsHide: true });
      out.userDeleted = true;
    } catch {
      out.userDeleted = false;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

export async function otherUser() {
  const cfg = newState("ou");
  try {
    const first = await cli(cfg, "ensure");
    if (!first.ok) throw new Error(JSON.stringify(first));
    const result = isWin ? await otherUserWindows(cfg, pathsOf(cfg)) : await otherUserPosix(cfg, pathsOf(cfg));
    return { ...result, supervisorStillAlive: alive(first.supervisorPid) };
  } finally {
    await cleanupState(cfg);
  }
}
