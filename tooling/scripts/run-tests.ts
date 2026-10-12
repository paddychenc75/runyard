import { spawnSync } from "node:child_process";

// pnpm test / pnpm verify 的测试部分：先跑单元测试阶段（各包并行），通过后再跑进程测试阶段
//（一次一个包，包内一个工作进程，docs/guides/testing.md）。把收到的参数（如 --filter、--affected）原样交给两个阶段。
// 单独跑一个阶段用 pnpm test:unit 或 pnpm test:process，它们是同样的 turbo 命令。
// 用 shell 启动 pnpm：Windows 上 pnpm 是 .cmd，直接 spawn 找不到；参数都是开发者自己写的 turbo 选项。

const forwarded = process.argv.slice(2);

function phase(name: string, turboArgs: string[]): void {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync("pnpm", ["exec", "turbo", "run", ...turboArgs, ...forwarded], {
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

phase("单元测试阶段（各包并行）", ["test"]);
phase("进程测试阶段（一次一个包）", ["test:process", "--concurrency=1"]);
