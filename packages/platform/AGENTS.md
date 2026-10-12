# @runyard/platform

## 用途

系统差异的唯一出口：`Platform` 接口、按系统分开的实现、路径与名称规则、契约测试（技术设计 §7.1，决策记录 0003、0013，`docs/architecture/platform-interface.md`）。
现状：接口已定全；`paths` 有真实现（`darwin`、`linux`）；其余各块是占位，抛 `INTERNAL`（“尚未实现”），随 #25 到 #28 逐块换成真实现。第一版只做 macOS，`win32` 不写。

## 对外暴露什么

只从 `src/index.ts` 导出：`getPlatform()`、`platformFor()`、`Platform` 及其类型、`AbsPath` / `PosixRelPath` 与 `absPath` / `posixRelPath` / `joinPath`、`PlatformError` / `platformError`。其他包只从 `@runyard/platform` 导入。
`getPlatform()` 是整个代码库唯一读取运行系统的地方；不支持的系统抛 `NOT_SUPPORTED`，不退到别的实现。测试用 `getPlatform({ home, arch, profile })` 或 `platformFor()` 指向临时目录。

## 本包特有的规则

- 可以导入：`@runyard/protocol`（只用它的错误码）。依赖规则的唯一出处是 `tooling/checks/layers.json`。不放原生模块，不导入 Electron。
- 接口不假设 POSIX：不出现信号、进程组；进程身份是 pid 加启动时间（`ProcRef`）；`proc.terminate` 核对身份，对不上就什么也不做；`fs.trash` 可以失败，绝不退到永久删除；`ipc.endpoint()` 是不透明字符串；锁住的路径是 `PATH_LOCKED`。
- 路径用 `AbsPath` / `PosixRelPath`，用 `node:path` 拼，不手写分隔符；相对路径永远用 `/`。
- 错误是 `PlatformError`（携带协议的代码加参数加英文 `debug`），不产生给人看的句子。系统“不支持”用 `NOT_SUPPORTED`，“还没写”的占位用 `INTERNAL`。
- 名称校验在所有系统一致（保留名、末尾的点和空格），不要按系统放宽。
- 实现之间不互相引用；共用部分在 `posix/`，`darwin/` 和 `linux/` 只组合它并写自己的差别。不写 `win32/`，也不加任何只属于 Windows 的代码。
- 给 `Platform` 加成员，必须同时在 `src/contract/` 加契约用例（`platform-contract` 检查）；`platform.ts` 的写法（分组用内联对象类型、每个成员单独声明）是那个检查的解析依据。
- 契约测试通过 `@runyard/platform/contract` 导出给 `@runyard/testing`，假平台跑同一组用例；`ContractContext.complete` 为 true 的实现（假平台）不跑占位那一组。
- 实现一块占位时：在 `posix/` 或 `darwin/` 写真实现，换掉 `posix/pending-areas.ts` 里对应的占位，再把 `contract/pending.contract.ts` 里对应的行换成真用例。

## 子目录地图

- `src/platform.ts`：`Platform` 接口和它的类型；`src/get-platform.ts`：`getPlatform()`
- `src/path-types.ts`、`src/platform-error.ts`、`src/platform-options.ts`
- `src/paths/`：名称校验（各系统一致的纯函数）
- `src/posix/`：darwin 与 linux 共用的部分：长度检查、网盘与用户文件夹的判断（POSIX 路径，用 `node:path/posix`，任何系统上结果一样）、占位；`src/darwin/`、`src/linux/`：各系统的组合
- `src/contract/`：契约测试，同一组用例对每个实现各跑一遍
- `vitest.config.ts`：继承 `tooling/vitest/base.ts`，不要在这里改测试规则

## 测试

```sh
pnpm test --filter @runyard/platform
```

不需要平台实现的测试照常命名；需要的，文件名以 `.platform-dependent.test.ts` 结尾，Windows 任务不跑它（唯一的跳过机制，见 `docs/guides/testing.md`）。契约测试就是这一类。测试里不写系统判断。
