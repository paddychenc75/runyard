import { execFileSync } from "node:child_process";
import { join } from "node:path";

// package 任务的入口（技术设计 §8.2、决策记录 0007）：打出未签名的 macOS 包，并对结果断言。
//   pnpm --filter @runyard/desktop package -- [--out <目录>] [--dir] [--e2e]
//   --out  输出目录，缺省 apps/desktop/release；试验时给 mktemp -d 建的新目录（不要放在 /tmp 下，打包工具拒绝）
//   --dir  只打 .app，不做 dmg 和 zip
//   --e2e  端到端测试用的构建，保留 nodeCliInspect；不加则是正式构建，断言它是关的
// 分四步，每一步单独打印，CI 里哪一步失败一眼可见：构建、显式下载 Electron 二进制、打包并断言开关、codesign 校验。
// 只在 macOS 上有意义（ad-hoc 签名和校验用系统的 codesign）。

const desktop = join(import.meta.dirname, "..", "..", "apps", "desktop");
const args = process.argv.slice(2).filter((arg) => arg !== "--");

function step(title: string, command: string, argv: string[]): void {
  console.log(`\n== ${title}`);
  execFileSync(command, argv, { cwd: desktop, stdio: "inherit" });
}

step("1/4 构建主进程、预加载脚本、界面", process.execPath, ["build.ts"]);
step(
  "2/4 下载 Electron 二进制（已有则跳过）",
  join(desktop, "node_modules", ".bin", "install-electron"),
  [],
);
step("3/4 打包并断言开关", process.execPath, ["pack.ts", ...args]);

const outIndex = args.indexOf("--out");
const out = outIndex === -1 ? join(desktop, "release") : (args[outIndex + 1] as string);
step("4/4 codesign 校验", "codesign", [
  "--verify",
  "--deep",
  "--strict",
  join(out, "mac-arm64", "Runyard.app"),
]);
console.log("\n完成");
