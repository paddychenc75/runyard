import { spawnSync } from "node:child_process";
import { changedFilesSinceBase, templateReaderArgs } from "./template-readers.ts";

// pnpm test / pnpm verify 的测试部分：先跑单元测试阶段（一次一个包，包内文件并行），通过后再跑进程测试阶段
//（一次一个包，包内一个工作进程，docs/guides/testing.md）。把收到的参数（如 --filter、--affected）原样交给两个阶段。
// 单独跑一个阶段用 pnpm test:unit 或 pnpm test:process，它们是同样的 turbo 命令。
// 用 shell 启动 pnpm：Windows 上 pnpm 是 .cmd，直接 spawn 找不到；参数都是开发者自己写的 turbo 选项。

const forwarded = process.argv.slice(2);

// --affected 看不到包外的 templates/，模板变了就把读模板的包再跑一遍（#149，template-readers.ts）；
// 已跑过的任务命中缓存，不会重复花时间。算不出基线时按“模板变了”处理。
const extraArgs = forwarded.includes("--affected")
  ? templateReaderArgs(forwarded, changedFilesSinceBase(process.cwd()) ?? ["templates/"])
  : undefined;

function turbo(turboArgs: string[], extra: readonly string[]): void {
  const result = spawnSync("pnpm", ["exec", "turbo", "run", ...turboArgs, ...extra], {
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function phase(name: string, turboArgs: string[]): void {
  console.log(`\n=== ${name} ===`);
  turbo(turboArgs, forwarded);
  if (extraArgs !== undefined) {
    console.log("模板有改动：另跑读模板数据的包");
    turbo(turboArgs, extraArgs);
  }
}

phase("单元测试阶段（一次一个包，包内文件并行）", ["test", "--concurrency=1"]);
phase("进程测试阶段（一次一个包）", ["test:process", "--concurrency=1"]);
