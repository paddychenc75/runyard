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

## 例：给一次运行写单元测试

假平台、假进程、假时钟在 `@runyard/testing`（用法见 `packages/testing/AGENTS.md`）。被测代码从参数拿平台和时钟，测试换成假的；时间由 `clock.advance` 推进，不真的等。下面的代码在 `packages/testing/src/run-example.test.ts` 里，是跑得通的测试：

```ts
const fake = createFakePlatform();
// 剧本：1.5 秒后监听 7100；先起一个子进程
fake.processes.when(argv, { listenOn: { port: 7100, atMs: 1500 }, children: [{ atMs: 0 }] });

const proc = fake.platform.exec.spawn({ argv, cwd, env: {}, stdin: false });
const ready = waitReady(fake.platform, fake.clock, 7100, 30_000);
await fake.clock.advance(1500); // 不真的等 1.5 秒
expect(await ready).toBe(true);

await stop(fake.platform, proc);
expect(await fake.platform.proc.members(proc.ref)).toEqual([]);
expect(await fake.platform.ports.isFree(7100)).toBe("free");
```

要点：`ignoresStop` 走强制结束路径；`addForeign` 用同一个 pid 加不同启动时间模拟进程号被复用；`ports.occupy` 布置被占用的端口；`tools.install` 布置工具和版本。用到 `@runyard/testing` 的包把它写进 `devDependencies`，只在 `*.test.ts` 里导入（`testing-imports` 检查）。需要真实目录时用 `createTempHome()`，把它的 `home` 传给平台，不读环境变量。

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
