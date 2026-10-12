// 调用 electron-builder 打一份包，记下耗时和它在构建时下载了什么。
// 既能被实验脚本当函数用，也能单独跑：node scripts/build.mjs --platform mac --arch arm64 --targets dir --out /tmp/x
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const k3Root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

// opts: { platform: 'mac'|'win', arch, targets: ['dir','dmg','zip'|'nsis'], version, protocol, fuses, identity, nsis, out, cacheDir, prepackaged }
export function build(opts) {
  const out = opts.out;
  const stage = path.join(out, "stage");
  fs.mkdirSync(stage, { recursive: true });
  fs.writeFileSync(path.join(stage, "build-info.json"), JSON.stringify({ version: opts.version ?? "0.3.0", protocol: opts.protocol ?? 1, fuses: opts.fuses ?? "strict", builtAt: new Date().toISOString() }));
  const cli = path.join(path.dirname(require.resolve("electron-builder/package.json")), "cli.js");
  const args = [cli, `--${opts.platform}`, ...opts.targets, `--${opts.arch}`, "--config", "electron-builder.config.mjs", "--publish", "never"];
  if (opts.prepackaged) args.push("--prepackaged", opts.prepackaged);
  const env = {
    ...process.env,
    K3_VERSION: opts.version ?? "0.3.0",
    K3_STAGE: stage,
    K3_OUT: out,
    K3_FUSES: opts.fuses ?? "strict",
    K3_IDENTITY: opts.identity ?? "default",
    K3_NSIS_VARIANT: opts.nsis ?? "hook",
    // 不许打包工具去钥匙串里找开发者证书：这次验证的就是“没有证书”时它怎么做
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
    // 打包工具自己的下载缓存放进临时目录，不在用户目录里留东西（Electron 本体的缓存用默认位置）
    ELECTRON_BUILDER_CACHE: opts.cacheDir,
    DEBUG: "electron-builder",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const logFile = path.join(out, "build.log");
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: k3Root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let log = "";
    const take = (d) => {
      log += d;
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("close", (code) => {
      fs.writeFileSync(logFile, log);
      const lines = log.split(/\r?\n/);
      // 打包工具的日志里，关键的几行以 "  •" 开头；下载的地址在 url= 里
      const highlights = lines.filter((l) => /^\s*[•⨯]/.test(l)).map((l) => l.trim().slice(0, 400));
      const downloads = [...new Set(lines.flatMap((l) => l.match(/https?:\/\/[^\s"']+/g) ?? []).filter((u) => /github\.com|electronjs|npmmirror|electron-builder-binaries/.test(u)))];
      resolve({ ok: code === 0, code, ms: Date.now() - t0, out, logFile, highlights, downloads, opts: { ...opts, cacheDir: undefined } });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (name, fallback) => (a.includes(`--${name}`) ? a[a.indexOf(`--${name}`) + 1] : fallback);
  const out = path.resolve(opt("out", "dist"));
  const r = await build({
    platform: opt("platform", process.platform === "win32" ? "win" : "mac"),
    arch: opt("arch", process.arch),
    targets: opt("targets", "dir").split(","),
    version: opt("version"),
    protocol: Number(opt("protocol", 1)),
    fuses: opt("fuses"),
    identity: opt("identity"),
    nsis: opt("nsis"),
    out,
    cacheDir: opt("cache", path.join(out, "eb-cache")),
  });
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.ok ? 0 : 1;
}
