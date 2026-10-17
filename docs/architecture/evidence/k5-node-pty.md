# K5 的证据：node-pty 的预编译文件能否在打包后的 Electron 44 里直接加载

对应技术设计 §6.3（pty-host）、§12 的 K5 和 issue #253。本文自成一体：测量用的脚本和一次性应用是临时的，没有进仓库，这里保留做法、数字、结论、需要的配置和没有验证的部分。本 PR 不改任何代码、不加依赖。

## 结论

**能。** node-pty 1.1.0 自带的 `darwin-arm64`、`darwin-x64` 预编译文件，在用本仓库 `builderConfig` 和正式构建的打包开关（`RELEASE_FUSES`）打出的 ad-hoc 签名应用里，从 utilityProcess 直接加载，不为 Electron 重新编译（它走 N-API，没有 Electron ABI 问题），开出用户的登录 shell，收发数据、改大小、结束都正常。

**但有一项必须配置，否则开不出 shell：`spawn-helper` 要有可执行权限。** 它在 npm 包里的权限是 `0644`，pnpm 装下来也是 `0644`，打进应用后原样保留，结果是 `new UnixTerminal` 抛出 `Error: posix_spawnp failed.`（`pty.node` 本身能加载，`require("node-pty")` 不报错，所以这个错误不在加载阶段，而在第一次开 shell 时）。打包前对 `prebuilds/darwin-*/spawn-helper` 做一次 `chmod 755` 就好。

## 做法

在本机（Apple M3 Max，macOS 27.0.1，Electron 44.5.1，Node 24.21.0）：

1. `npm pack node-pty@1.1.0 --ignore-scripts` 取包，核对：发布日 2025-12-22（已满 298 天），OSV 查询无公告，GitHub 公告库 `microsoft/node-pty` 0 条；运行时无依赖（`node-addon-api` 只在从源码编译时用）。
2. 一次性脚本调用仓库里真实的 `apps/desktop/packaging/builder-config.ts`（含 `identity: "-"`、`hardenedRuntime`、`resetAdHocDarwinSignature`、`RELEASE_FUSES`），只改了文件清单（`main.cjs`、`pty-host.cjs`、`node_modules/node-pty`）、去掉额外资源，打出 `Runyard.app`（目录形式）。打包后用仓库的 `fuseMismatches` 读二进制：与 `RELEASE_FUSES` 逐项相符（`runAsNode` 开、`onlyLoadAppFromAsar` 开、嵌入式 asar 校验开、`nodeCliInspect` 关）。`codesign --verify --deep --strict` 通过。
3. 应用主进程用 `utilityProcess.fork` 起 `pty-host.cjs`（与技术设计 §6.3 的结构一致），pty-host 里：`require("node-pty")`；用 `os.userInfo().shell`（取自用户数据库，不依赖 `HOME`）作为登录 shell，`spawn(shell, ["-l"], …)`，环境里 `HOME` 指向临时目录；写入 `echo K5_$((20+22))_END`，读回；`stty size` 看大小；`resize(100, 30)` 后再看；起一个后台 `sleep 300 &` 记下它的 pid；`kill()`；等退出事件；再过 500 毫秒用 `kill(pid, 0)` 看 shell 和后台进程是否还在。
4. 启动应用时 `HOME` 设为 `mktemp -d` 新建的目录，`--root` 也在里面；每次运行前后核对真实的 `~/.runyard` 修改时间：全程没有变化。运行完用 `ps` 查：没有遗留的应用、shell 或 `sleep` 进程。

做了五种打包变体（A 到 E）和两种架构：

| 变体 | 配置 | 结果 |
| --- | --- | --- |
| A | `asarUnpack: ["**/node_modules/node-pty/prebuilds/**"]` + `chmod 755 spawn-helper` | 通过 |
| B | 同 A 的 `asarUnpack`，不 `chmod` | `posix_spawnp failed.` |
| C | 不写 `asarUnpack`，`chmod 755` | 通过（见下面“asar 之外”） |
| D | 不写 `asarUnpack`，不 `chmod` | `posix_spawnp failed.` |
| E | 把 A 重签成没有 `disable-library-validation` 的权限文件 | 应用本身起不来（见下面“签名”） |
| x64 | 同 A 的 `chmod`，Electron 44.5.1 `darwin-x64`（官方 zip，sha256 与发布页一致）经 Rosetta 运行 | 通过 |

## 数字（A 与 x64，各一次完整运行）

| 项 | arm64 | x64（Rosetta） |
| --- | --- | --- |
| `require("node-pty")` | 成功，解析到 `app.asar/node_modules/node-pty/lib/index.js` | 同 |
| 开 shell 到读回 `K5_42_END` | 33 到 35 毫秒 | 831 毫秒（含 Rosetta 首次翻译，只跑了一次） |
| 初始大小（行 列） | `24 80` | `24 80` |
| `resize(100, 30)` 之后 | `30 100` | `30 100` |
| shell 内的 `$HOME` | 临时目录（不是真实家目录） | 同 |
| `kill()` 到收到退出事件 | 26 到 29 毫秒，`{"exitCode":1,"signal":0}` | 29 毫秒，同 |
| 500 毫秒后 shell、后台 `sleep` 是否还在 | 都已不在 | 都已不在 |

arm64 另外重复跑过几次（A 变体及其重打的同配置包），结果相同。

## 需要的配置（打包任务要做的事）

1. **`spawn-helper` 加可执行权限。** 在拼应用目录（`pack.ts` 的 stage）时，对 `node_modules/node-pty/prebuilds/darwin-*/spawn-helper` 做 `chmod 755`，并在打包后断言应用里这两个文件有可执行位（否则像变体 B、D 那样，要到真正开终端才报错）。electron-builder 会保留文件权限。
2. **node-pty 要作为真实目录放进 stage 的 `node_modules`**，不能被 esbuild 打进主进程单文件（它要加载 `.node` 文件和单独执行 `spawn-helper`），也不能是 pnpm 的符号链接。现在 `pack.ts` 的 stage 只含 `dist` 和最小的 `package.json`，装 node-pty 时要把它（只要 `lib/`、`prebuilds/darwin-*`、`package.json`、`LICENSE`）拷进去，`package.json` 的 `dependencies` 里写上它。
3. **asar 之外：** electron-builder 26.17.0 看到模块里有 `.node` 文件，自己把整个 `node-pty` 解到 `app.asar.unpacked/`（变体 C 没写任何 `asarUnpack` 也通过，`spawn-helper` 在 `app.asar.unpacked/…/prebuilds/darwin-arm64/` 里）。node-pty 自己的代码会把路径里的 `app.asar` 换成 `app.asar.unpacked` 去找 `spawn-helper`，所以位置对得上。建议仍然在配置里明写 `asarUnpack: ["**/node_modules/node-pty/**"]`，别依赖自动规则（技术设计 §8 附近“node-pty 放在 asar 之外”这句本来就是这个意思）；本次没有单独验证“只写 `asarUnpack`、关掉自动规则”的情形。
4. **打包开关：不用改。** `RELEASE_FUSES` 下一切正常；`runAsNode`、嵌入式 asar 校验、`onlyLoadAppFromAsar` 都不挡 `.node` 文件和 asar 之外的可执行文件。
5. **签名：** electron-builder 会把解包出来的 `pty.node` 和 `spawn-helper` 也 ad-hoc 重签（大小因此变化），`codesign --verify --deep --strict` 通过。打包时那条警告（“ad-hoc 签名加加固运行时需要 `disable-library-validation`”）已经被 electron-builder 自带的默认权限文件满足：`codesign -d --entitlements -` 显示 `allow-jit`、`allow-unsigned-executable-memory`、`disable-library-validation` 三项都在。变体 E 证明这一项不能去掉：去掉后不只是 `pty.node`，连 `Electron Framework` 都被 dyld 拒绝加载（报错 “Library not loaded: @rpath/Electron Framework.framework/Electron Framework”，原因是代码签名校验不过），应用起不来。所以什么都不用加，但**不要自己写权限文件时漏掉它**。`spctl -a` 对该应用显示 `rejected`，这是未签名应用的已知状态（决策记录 0007），与 node-pty 无关。
6. **安装脚本与 `allowBuilds`：** node-pty 的 `install` 脚本是 `node scripts/prebuild.js || node-gyp rebuild`。`prebuild.js` 只检查 `prebuilds/<平台>-<架构>/` 是否存在，存在就 `exit 0`，**不下载也不编译**；`postinstall` 在 macOS 上只清理不存在的 `build/Release`，打印 “SKIPPED (not Windows)”。在一次性的试验目录里用 pnpm 11.28.0 和与仓库相同的安全设置（`minimumReleaseAge: 20160`、`strictDepBuilds: true`）分别写 `allowBuilds: { node-pty: true }` 和 `false` 安装：两种都成功，装下来的文件完全一样（`pty.node`、`spawn-helper` 都在，没有 `build/` 目录）。也就是说**在 macOS 上写 `false` 就够了**，脚本一行都不用跑；写 `true` 只在没有对应 `prebuilds` 目录的平台（例如 Linux）才会触发 `node-gyp rebuild`，那需要编译工具，反而会让 CI 的 Linux 安装变慢或失败。写哪个是依赖政策上的决定，由负责人在装依赖的 PR 里定；本验证的建议是 `false`，并在 `dependencies.md` 里写上“预编译文件随包，脚本不需要”。

## 没有验证的

- **pnpm 目录结构下的打包。** 本次用 npm 布局的临时应用目录；真实仓库里 node-pty 会在 `node_modules/.pnpm/…` 下并以符号链接出现，所以必须按上面第 2 条拷成真实目录，这一步还没做过。
- **经 DMG 安装、带隔离标记（quarantine）的应用。** 只测了直接从构建目录运行；下载后拖进“应用程序”再打开时 Gatekeeper 的行为留给真机和 K3 里已记的那一类验证。
- **从 Finder 或 Dock 启动时的环境。** 本次从命令行启动并显式给了 `PATH`；从图形界面启动的应用拿到的 `PATH` 很短，登录 shell（`-l`）会由 shell 的启动文件补全，但没有在带用户启动文件的真实 `HOME` 下测，用户的启动文件很慢或有交互提示时的表现没测。
- **结束的范围。** 只测了 `kill()`（SIGHUP）能带走交互式 shell 里用 `&` 起的后台作业；用 `nohup`、`setsid` 或放进别的会话的子进程不会被带走，这与决策记录 0006 的“结束进程树”是同一类问题，终端 issue #263 要处理。
- **数据通道。** 技术设计说数据经直连通道到界面、不经主进程，本次只验证 pty-host 内部的收发，没有接界面，也没有压测大量输出。
- **x64 只跑了一次，且经 Rosetta**；没有在真正的 Intel 机器上测。
- **Windows：** 第一版不做（决策记录 0013）。node-pty 的 `win32-*` 预编译文件本次被排除在包外，未验证。
