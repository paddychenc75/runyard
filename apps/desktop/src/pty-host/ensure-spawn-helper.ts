import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// node-pty 的 spawn-helper 在 npm 包和 pnpm 安装目录里是 0644，没有可执行位，开 shell 时报
// “posix_spawnp failed.”（K5 证据）。打包时已经 chmod 755 并断言；这里是开发和测试时的自检：
// 发现没有可执行位就补上。打包后的应用里它已经是 755，什么都不会改。

const EXECUTABLE = 0o111;

/** 给 `<包目录>/prebuilds/*​/spawn-helper` 补上可执行位；返回补了几个 */
export function ensureSpawnHelperExecutable(packageDir: string): number {
  // 打进 asar 的原生文件实际在 app.asar.unpacked 里（node-pty 自己也这样换路径）
  const dir = packageDir.replace("app.asar", "app.asar.unpacked");
  const prebuilds = join(dir, "prebuilds");
  if (!existsSync(prebuilds)) return 0;
  let fixed = 0;
  for (const platformDir of readdirSync(prebuilds)) {
    const helper = join(prebuilds, platformDir, "spawn-helper");
    if (!existsSync(helper)) continue;
    const mode = statSync(helper).mode;
    if ((mode & EXECUTABLE) === EXECUTABLE) continue;
    chmodSync(helper, mode | 0o755);
    fixed += 1;
  }
  return fixed;
}
