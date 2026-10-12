// 安装器（NSIS）自己做不了的两件事，由它调用内置命令行来做（技术设计 §8.2 “安装器与管理进程”）：
//   1. 覆盖安装、卸载之前请管理进程退出；
//   2. 卸载时把 bin 目录从用户的 PATH 里拿掉。
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { connectOnce, readDiscovery } from "./lib/client.mjs";
import { loadConfig } from "./lib/config.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
};

// 进程身份：进程号会被系统重用，所以强杀之前要核对“这个进程号现在还是不是那个管理进程”。
// 发现文件里记了可执行文件路径和启动时刻；这里取系统看到的路径和启动时间来比。
function identityOf(pid) {
  try {
    if (process.platform === "win32") {
      const ps = `$p = Get-Process -Id ${pid} -ErrorAction Stop; '{0}|{1}' -f $p.Path, $p.StartTime.ToUniversalTime().ToString('o')`;
      const [exe, started] = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", windowsHide: true }).trim().split("|");
      return { exe, startedAt: Date.parse(started) };
    }
    const started = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" }).trim();
    const exe = execFileSync("ps", ["-o", "comm=", "-p", String(pid)], { encoding: "utf8" }).trim();
    return { exe, startedAt: Date.parse(started) };
  } catch {
    return null;
  }
}

export async function stopSupervisorForInstaller(args) {
  const cfg = loadConfig(args);
  const reason = args.includes("--reason") ? args[args.indexOf("--reason") + 1] : "install";
  const t0 = Date.now();
  const discovery = readDiscovery(cfg);
  const result = { ok: true, wasRunning: false, runs: 0, asked: false, forced: false, gone: true, ms: 0, reason };
  const r = await connectOnce(cfg, { kind: "cli", clientId: `installer-${process.pid}` });
  if (!r.conn) {
    // 连不上：没有管理进程，或者它卡死了。发现文件里的进程要是还活着且身份对得上，就结束它
    if (discovery && alive(discovery.pid)) Object.assign(result, forceKill(discovery));
    result.ms = Date.now() - t0;
    return { ...result, connect: r.why ?? r.impostor ?? null };
  }
  result.wasRunning = true;
  result.supervisorPid = r.conn.welcome.pid;
  result.runs = r.conn.welcome.runs; // 这些运行会被停掉：安装器事先要说明的就是这个数
  const closed = new Promise((resolve) => r.conn.socket.once("close", resolve));
  try {
    await r.conn.request("supervisor.shutdown", { ifIdle: false, reason });
    result.asked = true;
  } catch (err) {
    result.askError = String(err.code ?? err);
  }
  // 最多等 5 秒（§8.2）。连接关了不等于进程没了，所以两样都看
  await Promise.race([closed, sleep(5_000)]);
  const pid = r.conn.welcome.pid;
  while (alive(pid) && Date.now() - t0 < 5_000) await sleep(25);
  if (alive(pid)) Object.assign(result, forceKill(discovery ?? { pid }));
  result.gone = !alive(pid);
  result.ms = Date.now() - t0;
  return result;
}

function forceKill(discovery) {
  const id = identityOf(discovery.pid);
  // 身份核对：路径一致，启动时间与发现文件记的相差不超过 5 秒（ps 的启动时间只精确到秒）
  const sameExe = id && discovery.execPath && path.resolve(id.exe).toLowerCase() === path.resolve(discovery.execPath).toLowerCase();
  const sameStart = id && typeof discovery.startedAt === "number" && Math.abs(id.startedAt - discovery.startedAt) < 5_000;
  if (!sameExe || !sameStart) return { forced: false, gone: !alive(discovery.pid), identityMismatch: { id, expected: { exe: discovery.execPath, startedAt: discovery.startedAt } } };
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(discovery.pid), "/T", "/F"], { windowsHide: true });
  else process.kill(discovery.pid, "SIGKILL");
  return { forced: true };
}

// Windows 用户 PATH（HKCU\Environment 的 Path）。要点：
//   按原样读（不展开 %VAR%）、保持原来的类型（REG_SZ / REG_EXPAND_SZ）、只增删自己那一项；
//   写完广播 WM_SETTINGCHANGE（借 .NET 的 SetEnvironmentVariable 删一个不存在的变量来触发），新开的终端才看得到。
//   不用 setx：它会把值截到 1024 个字符，还会把用户 PATH 和系统 PATH 混在一起。
export function editUserPath(mode, binDirArg) {
  if (process.platform !== "win32") return { ok: false, detail: "only on Windows" };
  const binDir = binDirArg ?? path.join(path.dirname(process.execPath), "bin");
  const script = `
$ErrorActionPreference = 'Stop'
$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
$had = $key.GetValueNames() -contains 'Path'
$cur = if ($had) { [string]$key.GetValue('Path', '', 'DoNotExpandEnvironmentNames') } else { '' }
$kind = if ($had) { $key.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
$bin = $env:K3_BIN_DIR.TrimEnd('\\')
# 只增删自己那一项，其余的字符一个不动（包括末尾有没有分号）：装了再卸之后要和原来逐字相同
$parts = @($cur -split ';')
$mine = @($parts | Where-Object { $_ -ne '' -and $_.TrimEnd('\\') -ieq $bin })
$changed = $false
if ($env:K3_PATH_MODE -eq 'add' -and $mine.Count -eq 0) {
  $next = if ($cur -eq '') { $bin } elseif ($cur.EndsWith(';')) { $cur + $bin + ';' } else { $cur + ';' + $bin }
  $key.SetValue('Path', $next, $kind); $changed = $true
} elseif ($env:K3_PATH_MODE -eq 'remove' -and $mine.Count -gt 0) {
  $next = (@($parts | Where-Object { $_ -eq '' -or $_.TrimEnd('\\') -ine $bin }) -join ';')
  # 删完什么都不剩：把这个值整个删掉（用户原来多半就没有它），不留一个空的 Path
  if ($next -eq '') { $key.DeleteValue('Path', $false) } else { $key.SetValue('Path', $next, $kind) }
  $changed = $true
}
$key.Close()
if ($changed) { [Environment]::SetEnvironmentVariable('RUNYARD_K3_PATH_PING', $null, 'User') }
'{0}|{1}' -f $changed, $kind
`;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, K3_BIN_DIR: binDir, K3_PATH_MODE: mode },
  });
  const [changed, kind] = (r.stdout ?? "").trim().split("|");
  return { ok: r.status === 0, mode, binDir, changed: changed === "True", kind, stderr: (r.stderr ?? "").trim().slice(0, 500) };
}
