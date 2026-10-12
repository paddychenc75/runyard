# 0014. 测试替身包只在测试里被导入

状态：已接受

日期：2026-10-12

来源：技术设计 §3.2（`@runyard/testing` 一行）；M1 议题 #32

## 背景

技术设计 §3.2 说 `@runyard/testing` 可以导入 protocol、platform、core，并标注“只在测试里用”；表里没有任何包被允许导入它，而 core、supervisor、client、命令行的单元测试都要用它的假平台、假进程、假时钟。表里也没说“只在测试里”怎样被强制。`layers.json` 原来把 `core` 标成 testing 的 `devOnly`，意思是 testing 对 core 的依赖只在开发时存在。

## 决定

1. `core`、`supervisor`、`client`、`runyard`（命令行）可以依赖 `@runyard/testing`，而且只能写在 `devDependencies` 里（`layers.json` 里各自的 `allow` 加它，`devOnly` 标它；`layers` 检查沿用已有的 devOnly 机制）。`protocol`、`platform`、`i18n` 不许：testing 自己要导入 protocol 和 platform，反过来会成环。
2. 新增 `testing-imports` 检查：`packages/` 和 `apps/` 下不是 `*.test.ts` 的源码文件不许导入 `@runyard/testing`（静态、动态、require 都查），所以它进不了产品。
3. `@runyard/testing` 实际只依赖 protocol 和 platform，不依赖 core，这样 core 的测试才能用它而不成环。`layers.json` 里 testing 对 core 的许可保持原样，真有成环的依赖会被 `tsc -b` 拒绝。
5. 测试怎样把 `~/.runyard` 和 `~/Runyard` 换成临时目录（`storage.md` 未定第 3 条）：显式传参。平台层的 `home` 选项（`getPlatform` 的 overrides、`createFakePlatform` 的 `home`）决定 `paths.home`、`stateDir`、`defaultLibrary`；`@runyard/testing` 的 `createTempHome()` 在系统临时目录里造这个主目录。不读环境变量。
4. 生产代码需要的“时钟”等接口，由使用它的包自己声明最小的结构类型（如 `{ now(); setTimeout(); clearTimeout() }`）；`FakeClock` 在结构上满足它，所以生产代码不必导入 testing。

## 后果

- 改了 `layers.json` 的依赖规则，原本需要负责人确认；协调人 2026-10-12 接受了本记录：它是在已经定下的包结构（技术设计 §3.2）之内的技术决定，没有增删包，也没有改产品行为。
- 每个新包要用假平台时，在 `devDependencies` 加 `@runyard/testing` 和 tsconfig 的 reference，不需要再改 `layers.json`。
- 夹带 `@runyard/testing` 的非测试文件会让 `pnpm check` 变红。

## 被否的方案

- 让 testing 依赖 core、core 的测试不用 testing：core 的运行引擎最需要假平台，不可行。
- 只靠 `devDependencies` 约束，不查源码：devDependency 也能被产品源码导入，约束落空。
- 靠环境变量覆盖主目录：全局状态会让并行测试互相影响，忘了设置就会写进真实目录。
