import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, readHookInput } from "./hook-input.ts";

// 智能体准备结束回复时的钩子（Stop）：只跑 tsc -b 和仓库检查，不跑测试（技术设计 §9.1、§9.3）。
// 不通过：退出码 2，把报错交给智能体，让它继续修。
// 超过 90 秒：放行，并打印一行警告（时间限制写在这个脚本里，不依赖钩子自己的超时设置）。
// 完整的验证仍然是 pnpm verify，这里只是结束前的最后一道快速检查。

// 环境变量只给测试这个脚本用（把上限调小来验证“超时放行”），平时不设
const LIMIT_MS = Number(process.env.RUNYARD_STOP_HOOK_LIMIT_MS) || 90_000;
const started = Date.now();
readHookInput();

const steps: { name: string; args: string[] }[] = [
  { name: "tsc -b", args: [join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc"), "-b"] },
  { name: "pnpm check", args: [join(REPO_ROOT, "tooling", "checks", "run.ts")] },
];

function allow(message: string): never {
  // 退出码 0 时标准输出里的 JSON 会被解析；systemMessage 是显示给用户的一行提示
  console.log(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}

if (!existsSync(steps[0]?.args[0] as string)) {
  allow("结束前检查没有运行：依赖还没安装（先运行 pnpm install）。");
}

for (const step of steps) {
  const remaining = LIMIT_MS - (Date.now() - started);
  const result =
    remaining > 0
      ? spawnSync(process.execPath, step.args, {
          cwd: REPO_ROOT,
          encoding: "utf8",
          timeout: remaining,
        })
      : undefined;
  if (result === undefined || result.error !== undefined || result.signal !== null) {
    allow(`警告：结束前检查超过 90 秒（停在 ${step.name}），已放行。请手动运行 pnpm verify 确认。`);
  }
  if (result.status !== 0) {
    process.stderr.write(
      `结束前检查没有通过（${step.name}）。请修好下面的问题再结束；不要为了通过去放松检查，拿不准就问用户。\n${result.stdout}${result.stderr}`,
    );
    process.exit(2);
  }
}
