# 写测试

全新工作区在运行包含桌面端的测试前，先执行 `pnpm --filter @runyard/desktop electron:download`。
Electron 44 的包没有安装后自动下载步骤；二进制开关测试需要真实程序文件，不能依赖本机旧缓存。
CI 的三个系统测试任务显式执行这一步（#483），不跳过开关测试。

## 何时用

写或改任何测试之前；尤其是测试要用到 `@runyard/platform` 的实现（真的启动进程、绑端口、碰文件系统、读系统路径）时。

## 步骤

1. 测试放在代码旁边：`foo.ts` 的测试是 `foo.test.ts`。用 Vitest，不重试（共用配置在 `tooling/vitest/base.ts`，不要在包里改测试规则，也不要在单个测试上写超时）。
2. 判断这个测试需不需要平台实现：
   - 不需要（纯函数、协议形状、检查脚本、用 `@runyard/testing` 里的假平台的核心逻辑）：照常写 `foo.test.ts`。它在 macOS、Ubuntu、Windows 三个 CI 任务里都跑。
   - 需要：文件名以 `.platform-dependent.test.ts` 结尾，如 `contract.platform-dependent.test.ts`。它在 macOS 和 Ubuntu 里跑，在 Windows 任务里不进入测试范围，并且在单独的“进程测试阶段”里跑（见下一节）。
3. 这是仓库里**唯一**的“平台相关测试”跳过机制（决策记录 0013）。不要用别的办法：测试里不写系统判断（`process.platform`、`os.platform()` 等，`platform-branching` 检查会拦），不用 `.skipIf` 去按系统跳过，不在工作流里按系统挑文件。
4. 一个包的测试若全部带这个后缀，Windows 上该包就没有测试可跑，这不算失败（共用配置在 Windows 上允许“没有测试”）。
5. 用到真实文件系统、真实进程的测试只用临时目录和动态端口，不碰真实的 `~/Runyard` 和 `~/.runyard`，结束时清理自己起的东西；结束进程要同时核对 pid 和启动时间，不按名字找（决策记录 0006）。起的每个进程都要登记（`ProcessLedger`、`TrackedProcesses`，core 等包用 `@runyard/testing` 的 `registerSpawned`）；进程阶段每个文件结束后有统一守卫，登记过的进程还活着就结束它并让这个文件失败。
   等待只等可观察的条件（端口监听了、文件出现了、进程退出了），上限给宽（几十秒）；不要 `sleep` 一个“应该够了”的时间。
6. 平台接口加了成员，就在 `packages/platform/src/contract/` 里加契约用例（`describe("分组.成员", …)`）；`platform-contract` 检查会核对每个成员都出现过。起真进程、绑真端口的契约只对“就是当前系统”的实现注册（`ContractContext.native`），起的进程要逐个记账并在 teardown 核对无遗留。暂时没有实现的成员，登记在 `pending.contract.ts` 的清单里，实现它的人把那一行换成真用例。
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

## 两个阶段

同一个后缀同时决定测试跑在哪个阶段（`tooling/vitest/base.ts` 里的两个 Vitest project）：

| 阶段 | 包含 | 并发 | 命令 |
| --- | --- | --- | --- |
| 单元（`unit`） | 其余所有 `*.test.ts` | 一次一个包（`turbo --concurrency=1`），包内文件并行 | `pnpm test:unit` |
| 进程（`process`） | 所有 `*.platform-dependent.test.ts` | 一次一个包（`turbo --concurrency=1`），包内一个工作进程、一次一个文件 | `pnpm test:process` |

`pnpm test`（和 `pnpm verify` 里的测试部分）先跑单元阶段，通过后再跑进程阶段，所以起真进程的测试不会和别的测试抢 CPU。单元阶段也一次只跑一个包：十二个包同时起 Vitest，进程数是核数的好几倍，CI 的 2 到 4 核机器上先启动的测试文件被拖慢十几倍（资源库搜索、协议帧等用例因此偶发超过 5 秒，#306 #322 #316 #296），包内的文件并行已经用满所有核，包与包再并行只有争抢。只跑一个包或一个阶段：`pnpm test:unit --filter @runyard/core`、`pnpm test:process --filter @runyard/platform`；只跑一个文件：`pnpm --filter @runyard/platform exec vitest run --project process src/spawn-detached`。

新包照抄任一现有包的两行脚本（`test`: `vitest run --project unit`，`test:process`: `vitest run --project process --passWithNoTests`）和 `vitest.config.ts`，它的进程测试就自动归入进程阶段；`test-phases` 检查守着这两行。

进程阶段的超时只在 `tooling/vitest/base.ts` 里定一处（单个测试 120 秒，钩子 60 秒）。数字依据是实测：见该文件里的注释和下面的预算。

### 进程阶段的预算

进程阶段的预算：**每个系统不超过 5 分钟**（CI 的 `test` 任务上限是 15 分钟，技术设计 §8.3 要求整条流水线保持在 10 分钟内）。2026-10-12 在 GitHub 的 runner 上连续 6 次完整 CI 的实测（阶段独占机器，起停 50 次、单实例每系列 20 轮）：

| 系统（runner） | CPU 数 | 进程阶段耗时（6 次） | 单元阶段耗时 | 最慢的单个测试 |
| --- | --- | --- | --- | --- |
| `ubuntu-latest` | 4 | 94 到 119 秒 | 12 到 17 秒 | 约 24 秒（`ipc-single-instance` 八个启动者那两个） |
| `macos-26` | 3 | 100 到 170 秒 | 16 到 24 秒 | 约 22 秒（同上） |
| `windows-2025` | 4 | 6 到 9 秒（进程测试不进入范围，只有启动开销） | 19 到 30 秒 | — |
| 本机 M3 Max | 16 | 约 40 秒 | 约 2 秒 | 约 7 秒 |

占大头的是 `ipc-single-instance.platform-dependent.test.ts`（约 60 到 65 秒：四个系列各 20 轮，八个启动者的两个系列各约 20 秒，每轮要起 8 个 Node 进程，进程启动本身就是 CPU 活），其次是契约测试文件（约 20 到 40 秒，其中起停 50 次约 10 到 16 秒）。这些时间是真实工作量，不是等待；要缩短只能减轮数，但那是证据 0005 的每系列 20 轮，所以不减。新增的进程测试要先估好耗时，整个阶段超过预算就先和负责人商量，而不是调大预算或超时。

最慢的系统（macOS）上限 170 秒离预算还有 1.7 倍余量；超过 4 分钟就要查原因，不要先调预算。

## 性能实测：创建后多久看到编辑器

规格 `DESKTOP-EDITOR-04`（150 ms，手工验证）在打好的包上量，不在单元测试里量。脚本是 `apps/desktop/e2e/editor-latency.measure.ts`（文件名不是 `*.e2e.ts`，CI 不跑），用法和历次结果见 `docs/architecture/evidence/editor-150ms.md`。

## 偶发失败的规则

- 必过检查失败了，不许直接重跑了事：先开一个带 `flaky` 标签的 issue，写上失败的运行链接、哪个测试、哪个系统，再重跑。
- 同一个测试偶发失败两次：修好它，或者把它写进隔离名单 `tooling/vitest/quarantine.json`。名单的每一项要有原因、issue 编号和到期日，经 PR 评审；到期日之前这个测试被跳过，到期后它重新参与失败，同时 `pnpm check` 的 `quarantine` 检查失败，逼着有人修好或重新评审。`id` 的写法是 `相对仓库根的测试文件路径::describe 标题 > 测试标题`。
- 没有自动化的部分：开 `flaky` issue 和“偶发两次”的计数靠人（和审查者）；名单只管到期，不管该不该进名单。

## 验证

```sh
pnpm test --filter @runyard/platform   # 先单元阶段，再进程阶段
pnpm test:process --filter @runyard/platform   # 只跑进程阶段
pnpm check
```

想确认 Windows 上的行为，不用 Windows 电脑：`tooling/vitest/base.test.ts` 用 `createConfig("win32")` 验证排除规则；`pnpm check` 里的 `platform-branching` 保证没人绕开后缀。

## 图标改动的设计对照证据

Node 24 下运行 `node tooling/design-render/icon-review.ts`，默认在新临时目录生成八组浅深 × 中英 × 1440/1100 的 PNG、HTML 和说明文件。`RUNYARD_ICON_REVIEW_BASE` 可指定基线提交（默认当前提交与 `origin/main` 的共同祖先），`RUNYARD_ICON_REVIEW_OUTPUT` 可指定产物目录，`RUNYARD_ICON_REVIEW_CHROME` 可指定 Chrome 可执行文件。

样片读取基线与当前工作树的 SVG、`Icon` / `IconButton` 样式和设计变量，附上展开后的 `SpecType` 图标规范，并记录提交与样式哈希。这是静态 SVG/CSS 取证，真实 React 组件仍由 `ui-visual` 验证；不更新基准图。CI 的 `ui-visual` 会上传 `icon-design-comparison` 产物，评审时下载并打开八张 PNG，避免证据只留在开发者本机。

## 完成标准

- 需要平台实现的测试都带 `.platform-dependent.test.ts` 后缀，其余不带。
- 起了进程的测试把进程登记了，没有固定睡眠，没有单个测试上的超时。
- 测试里没有系统判断，也没有没带编号的跳过。
- 新的平台接口成员在契约测试里出现过。
- 测试在 macOS 和 Ubuntu 上通过，Windows 任务只跑平台无关的部分。

## 品牌 A 的实际侧栏取证

Node 24 下运行 `pnpm --filter @runyard/desktop build`，然后 `node apps/desktop/e2e/sidebar-brand.measure.ts`。默认产物写入独立临时目录，`RUNYARD_BRAND_OUTPUT` 可指定目录；`RUNYARD_E2E_APP` 可指定端到端包。CI 上传 `sidebar-brand-a-comparison`。

取证以 2026-10-19 负责人批准的品牌 A 局部（`apps/desktop/e2e/brand-a-reference.html`）和官方明暗 `icon-32.svg` 对照真实 Electron Sidebar，输出浅深 × 中英 × 1440/1100 八组完整窗口、品牌局部、并排图与尺寸/资产哈希。参考稿是放大预览；真实标题使用现有28px字号与32px图标适配侧栏，差异写在产物README。脚本同时验证图标已解码、与官方SVG逐字节一致、主题对应、读屏不重复及无溢出。本次不代表 #448 其他侧栏设计已完成。 额外四张 `theme-*.png` 验证跟随系统浅/深以及显式主题覆盖相反系统主题；`pnpm --filter @runyard/desktop e2e:run sidebar-brand.e2e.ts` 单独运行同一组真实样式断言。

## 设置页的设计对照证据

Node 24 下先运行 `node tooling/design-render/render.mjs Settings SettingsDark SettingsEn SettingsDarkEn SettingsNarrow SettingsNarrowDark SettingsNarrowEn SettingsNarrowDarkEn`，再运行 `pnpm --filter @runyard/desktop build` 和 `node apps/desktop/e2e/settings-design.measure.ts`。脚本每次新建临时 HOME/root，顺序启动自己的 Electron 应用并核对收尾，输出八组 1440/1100 × 浅深 × 中英文的原图、并排图和测量 JSON；1100 宽滚到“编辑与运行”，1440 宽停在最上面。

`RUNYARD_SETTINGS_REVIEW_OUTPUT` 指定产物目录，不设时新建临时目录；`RUNYARD_REVIEW_CHROME` 可覆盖生成并排图用的 Chrome 路径。原图保留原始像素，并排图按相同 CSS 逻辑像素展示（设计渲染器输出 2× 图，按 820×900 显示），设计稿与设置窗口都为 820×900；主窗口分别设为1440/1100宽以核对两者独立。设置窗口没有侧栏或标签条；截图只包含网页内容，原生红绿灯位置/全屏能力在窗口e2e核对。测量核对 720 内容列居中、140 标题区、至少 54 行高、至少 24 文字与控件间距、说明不超过两行、没有横向溢出。真实设置值、工具检测结果取当前临时环境；内容不同应在评审里说明。`settings.e2e.ts` 另测最小 760 宽英文导航的 Tab 顺序、末按钮完整可见、焦点环四边至少 4px 留白，以及主页面不横向溢出。

设置窗口的端到端操作先用 `e2e/support/settings-window.ts` 的 `openSettingsWindow` 取得该窗口，
不要把主窗口的 `page` 当作设置页。主窗口与设置窗口共享进程但网页不同；用例分别核对焦点、
主题重开后切回系统、关闭设置后主窗口状态，以及原生选择框属于发起操作的前台窗口。

## 工具路径输入的设计对照

#484 的 `apps/desktop/e2e/tool-path.e2e.ts` 在临时 HOME 内生成只输出版本号的可执行文件，验证含空格路径输入、保存、无效文件不覆盖、Escape、Tab 和重新装载后读取。它走真实工具验证，不执行用户的工具路径。

Node 24 下先运行 `node tooling/design-render/render.mjs SettingsNarrow SettingsNarrowDark SettingsNarrowEn SettingsNarrowDarkEn` 和桌面构建，再运行 `node apps/desktop/e2e/tool-path-design.measure.ts`。脚本固定四个工具的检测报告（含 universal 架构和缺失工具），仅供画面取证；主窗口 1440/1100 分别搭配真实独立设置窗口 820/760，浅深×中英共八组。设计图抽取现有 SettingsNarrow 的运行环境区域，保留内部样式；新增完整输入框、辅助选择按钮和输入说明是批准的差异，版本及架构用固定测试状态。量尺检查架构与状态至少 8px、各行状态列对齐、输入可用宽度和无横向溢出。`RUNYARD_TOOL_PATH_REVIEW_OUTPUT` 指定新临时产物目录；CI 上传 `tool-path-design-comparison`。

## 预览刷新动效的真实应用取证

Node 24 下先 `pnpm --filter @runyard/desktop build`，再运行 `pnpm --filter @runyard/desktop e2e:run preview-refresh.e2e.ts`。用例在临时主目录创建真实静态页面，先点击页面计数器，再点击应用刷新按钮并确认计数归零；以网络请求挂起/放行验证慢加载持续旋转、失败恢复及减少动态偏好，不用固定睡眠。

设计对照先运行 `node tooling/design-render/render.mjs Web WebEn WebLight WebLightEn --no-shots`，再运行 `node apps/desktop/e2e/preview-refresh-design.measure.ts`。默认在独立临时目录输出八组浅深 × 中英 × 1440/1100 的静止、加载中、设计并排图与尺寸记录；`RUNYARD_REFRESH_OUTPUT` 可指定独立输出目录，`RUNYARD_E2E_APP` 可切换到端到端包。CI 上传 `preview-refresh-design-comparison`，下载后打开八张 comparison.png 和 loading.png。

Web 系列只有 1440 画板，1100 对照保留原布局裁取，不代表存在窄窗设计稿。原生预览另附 preview.png；静态项目和设计的 React 示例内容不同，原有顶栏/侧栏差异分别由 #446/#448 追踪，停止图标沿用已合并 #475。动效是 #477 批准的新增行为，不能用静止图证明动效生命周期，须结合真实端到端结果。

### 脚本输出布局取证（#464）

先构建桌面应用，运行 `node tooling/design-render/render.mjs Script ScriptDark ScriptEn ScriptDarkEn`，再运行 `node apps/desktop/e2e/script-output-design.measure.ts`。脚本在临时 HOME/root 中创建 Node 脚本项目，覆盖浅深、中英、1440/1100八组；输出目录由 `RUNYARD_SCRIPT_REVIEW_OUTPUT` 指定，否则新建临时目录。只验证右侧输出与底部终端入口，未点击前不创建 shell；示例程序与设计的 Python 示例不同，PR 中列明差异。CI 上传 script-output-design-comparison。

### 窗口顶部取证（#446）

先渲染 Main、MainSidebarHidden、Web、Settings 的浅深中英画板，再运行 `node apps/desktop/e2e/window-header.measure.ts`。每个临时实例覆盖1440/1100、展开/收起/项目/独立设置四种状态，32组对照与 measurements.json 写到 `RUNYARD_HEADER_REVIEW_OUTPUT` 或新临时目录。原生红绿灯API坐标19/19；侧栏按钮90/12，展开收起恢复不移动；首标签134，标题70，文件树顶52/圆角9。项目原生预览单独截图后按占位实测坐标合成，保留原始图和预览图。没有窄版的画板使用完整参考，不把裁切稿当窄窗设计。
