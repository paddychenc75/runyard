# 写测试

## 何时用

写或改任何测试之前；尤其是测试要用到 `@runyard/platform` 的实现（真的启动进程、绑端口、碰文件系统、读系统路径）时。

## 步骤

1. 测试放在代码旁边：`foo.ts` 的测试是 `foo.test.ts`。用 Vitest，不重试（共用配置在 `tooling/vitest/base.ts`，不要在包里改测试规则）。
2. 判断这个测试需不需要平台实现：
   - 不需要（纯函数、协议形状、检查脚本、用 `@runyard/testing` 里的假平台的核心逻辑）：照常写 `foo.test.ts`。它在 macOS、Ubuntu、Windows 三个 CI 任务里都跑。
   - 需要：文件名以 `.platform-dependent.test.ts` 结尾，如 `contract.platform-dependent.test.ts`。它在 macOS 和 Ubuntu 里跑，在 Windows 任务里不进入测试范围。
3. 这是仓库里**唯一**的“平台相关测试”跳过机制（决策记录 0013）。不要用别的办法：测试里不写系统判断（`process.platform`、`os.platform()` 等，`platform-branching` 检查会拦），不用 `.skipIf` 去按系统跳过，不在工作流里按系统挑文件。
4. 一个包的测试若全部带这个后缀，Windows 上该包就没有测试可跑，这不算失败（共用配置在 Windows 上允许“没有测试”）。
5. 用到真实文件系统、真实进程的测试只用临时目录和动态端口，不碰真实的 `~/Runyard` 和 `~/.runyard`，结束时清理自己起的东西；结束进程要同时核对 pid 和启动时间，不按名字找（决策记录 0006）。
6. 平台接口加了成员，就在 `packages/platform/src/contract/` 里加契约用例（`describe("分组.成员", …)`）；`platform-contract` 检查会核对每个成员都出现过。暂时没有实现的成员，登记在 `pending.contract.ts` 的清单里，实现它的人把那一行换成真用例。
7. 跳过一个测试（`.skip`、`.todo`）必须在同一行或上一行写 issue 编号（`skips` 检查）。按系统跳过不算在内，用第 2 步的后缀。

## 验证

```sh
pnpm test --filter @runyard/platform
pnpm check
```

想确认 Windows 上的行为，不用 Windows 电脑：`tooling/vitest/base.test.ts` 用 `createConfig("win32")` 验证排除规则；`pnpm check` 里的 `platform-branching` 保证没人绕开后缀。

## 完成标准

- 需要平台实现的测试都带 `.platform-dependent.test.ts` 后缀，其余不带。
- 测试里没有系统判断，也没有没带编号的跳过。
- 新的平台接口成员在契约测试里出现过。
- 测试在 macOS 和 Ubuntu 上通过，Windows 任务只跑平台无关的部分。
