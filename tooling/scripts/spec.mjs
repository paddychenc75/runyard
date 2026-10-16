import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// pnpm spec <参数…> —— 带着关闭联网的环境变量调用 OpenSpec（技术设计 §9.6.2、§9.6.3）。
// 用脚本而不是在命令前写环境变量，因为后一种写法在 Windows 上不能用；
// 文档和 skill 一律只写 `pnpm spec …`。

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

// 无条件覆盖：外面设了 OPENSPEC_TELEMETRY=1 也不放行。
// DO_NOT_TRACK 是 OpenSpec 同样认的通用开关，一并设上。
export function specEnv(base = process.env) {
  return {
    ...base,
    OPENSPEC_TELEMETRY: "0",
    OPENSPEC_NO_UPDATE_CHECK: "1",
    DO_NOT_TRACK: "1",
  };
}

// 直接用 node 运行包里声明的命令行入口，不经 node_modules/.bin 的壳脚本（Windows 上那是 .cmd，不能直接启动）
export function openspecBin(root = ROOT) {
  // 根目录的直接依赖，pnpm 在 node_modules 下放了链接；包没有导出 package.json，所以不用 require.resolve
  const manifest = join(root, "node_modules", "@fission-ai", "openspec", "package.json");
  const { bin } = JSON.parse(readFileSync(manifest, "utf8"));
  return join(dirname(manifest), typeof bin === "string" ? bin : bin.openspec);
}

export function runSpec(args, { cwd = ROOT, env = process.env } = {}) {
  return spawnSync(process.execPath, [openspecBin(), ...args], {
    cwd,
    env: specEnv(env),
    stdio: "inherit",
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runSpec(process.argv.slice(2));
  process.exit(result.status ?? 1);
}
