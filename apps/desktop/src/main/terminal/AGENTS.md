# 集成终端的后台部分（主进程一侧和 pty-host）

## 用途

规格 desktop/terminal（DESKTOP-TERMINAL-01 至 38 的后台部分），技术设计 §6.3，K5 证据 `docs/architecture/evidence/k5-node-pty.md`，issue #263。界面部分见下面“界面部分”一节（`src/renderer/features/terminal/`）。

## 对外暴露什么
不是库。主进程对界面暴露的是桥的 `terminal.*` 方法（打开、接上、断开、写入、改大小、回执、清屏、重新打开、前台命令，白名单在 `src/shared/terminal.ts`）和 `terminal.data`、`terminal.state` 两个事件；对控制器是 `TerminalHooks`（`controller-hosts.ts`）；对管理进程是 `playground.releaseRequested` 的回应。内部消息（`shared/pty-host-messages.ts`）不对外。

## 本包特有的规则

- **输出走现有的桥，带流控**：pty-host → 主进程 → 界面都按字符数记账，界面回执（`terminal.ack`）多少才放行多少；超过 1 MiB 没回执，伪终端 `pause()`，降到 256 KiB 以下 `resume()`。界面没接上（终端不显示）时输出记进缓冲、立刻回执，命令照常运行（DESKTOP-TERMINAL-04）。窗口关闭或离开标签页 = `terminal.detach`，终端不结束（DESKTOP-TERMINAL-31）。
- **登录 shell**：取自系统用户记录（`os.userInfo().shell`），不看环境变量；起不来（文件不在、不能执行、抛错、600 毫秒内退出）改用 `/bin/zsh`，`started` 事件带 `notice: { code: "SHELL_FALLBACK", shell, reason }`，第一行文字由界面经文案包写。以登录方式启动靠 `/bin/bash -c 'exec -a "-zsh" …'` 换 argv[0]（`$0` 才是 `-zsh`，`zsh -l` 做不到；系统的 `login` 会把工作目录改回家目录）。
- **环境**：应用自己的环境去掉 `ELECTRON_*` 当起点，补 `SHELL`、`TERM=xterm-256color`、`COLORTERM=truecolor`、UTF-8 的 `LANG`；随应用安装的 `Contents/Resources/bin`（里面是 `runyard`）放在 `PATH` 最前面（源码运行时没有）。`PATH` 的其余部分由登录 shell 的启动文件补（nvm 等）。
- **结束 = 不留进程**：先 `kill()`（挂断，shell 会带走自己的作业），再按进程身份整组结束（`proc.terminate`，pid 加启动时间），再按事先取到的终端成员名单结束共用这个终端的进程，最后按终端标记（环境变量 `RUNYARD_TERMINAL`，一个终端一个随机值）找出脱离进程组的后代逐个结束。**限制**：平台层读不到 Apple 自带受保护程序（`/bin/sleep`、`/usr/bin/perl`、`zsh` 等）的环境，这些靠前两步；node、Homebrew 的程序靠标记也找得到。**`nohup sleep 1000 &`（#340）**：这类既忽略挂断、又自成进程组、又读不到环境的 Apple 自带程序，靠平台层的 `proc.terminalMembers`（与 shell 共用控制终端的进程，macOS 按 `ps` 的终端设备号认，因为 `sess` 恒为 0）：结束时先在 shell 还活着时取名单，shell 收尾后再逐个结束。限制：shell 自己先退出（用户敲了 `exit`）之后留下的后台作业不再属于这个终端，找不到；`setsid` 脱离终端的靠标记。pty-host 崩溃或卡住时主进程用同样的办法亲手收拾（`kill-terminal.ts`）。应用被强制结束：`watch-parent.ts` 每秒核对父进程的身份，没了就收尾退出。
- **不显示给人看的句子**：状态和事件只有代码和数据。“终端已结束（退出码 N）”“终端意外结束”“项目已改名，终端已关闭”“重新打开终端”、确认里的命令名，由界面经文案包生成。
- **与生命周期的接线**：关标签页（`LibraryController.#dropProject`）→ `end(closed)`；在应用里重命名、移到废纸篓 → 先 `releaseProject`；管理进程广播 `playground.releaseRequested`（命令行 `runyard rm`、别的客户端的改名）→ 同一条路径，放完回报 `playground.released`；⌘Q → `terminals.dispose()` 与 `session.bye` 一起做。关标签页的确认：终端里有命令在运行时一定问（`closeRequest.terminalCommand`、`stopsRun`），“不再提示”只管运行那一句。

## 子目录地图

- `src/pty-host/`：终端进程，Electron 的 utilityProcess 里运行（`index.ts` → `dist/pty-host/index.cjs`），**仓库里唯一加载 node-pty 的地方**。`host.ts` 是核心（每个项目一个伪终端，伪终端、平台层、消息出口都从构造参数传入，用假的测）；`run.ts` 是真接线（node-pty、平台层、盯父进程）；`terminal-env.ts` 整理终端里的环境和登录 shell 的启动方式；`ensure-spawn-helper.ts` 开发时给 `spawn-helper` 补可执行位；`watch-parent.ts` 应用被强制结束时自己收尾。
- `src/main/terminal/terminal-service.ts`：主进程的终端服务，不认识 Electron（pty-host 经 `PtyHostLink` 接进来）。每个项目最多一个终端，`open` 才创建（第一次才启动 pty-host），状态 `TerminalState`（`shared/terminal.ts`），回滚缓冲 `output-buffer.ts`（最近 10000 行，切在行与行之间），流控，结束，意外结束的收拾。`kill-terminal.ts` 是主进程亲手收拾残余进程；`pending-replies.ts` 是向 pty-host 按编号等回话；`terminal-ipc.ts` 校验界面的消息；`terminal-smoke.ts` 是冒烟。
- `src/main/integration/pty-host-process.ts`（utilityProcess 接线）和 `terminal-host.ts`（路径、`runyard` 目录、冒烟入口）是 Electron 一侧。`project-release.ts`（在 `src/main/`）把改名、移到废纸篓、关标签页接到终端上。
- 消息：`shared/terminal.ts`（界面与主进程，白名单在 `shared/desktop-bridge.ts`）、`shared/pty-host-messages.ts`（主进程与 pty-host，pty-host 逐项校验）。

## 测试

- 假的：`terminal-service.test.ts`（假 `PtyHostLink`）、`pty-host/host.test.ts`（假伪终端）、`library-controller-terminal.test.ts`（假终端钩子）。
- 真的（`*.platform-dependent.test.ts`，只在 macOS 有意义：node-pty 没有 Linux 的预编译文件，见 #336）：`terminal-real…`（服务 + pty-host 核心 + 真 node-pty 和 zsh，临时 HOME 和项目文件夹）、`terminal-process…`（pty-host 作为独立 Node 进程，被强制结束、父进程被强制结束）。
- 打包后的应用：`Runyard --terminal-smoke`（开终端、回显、改大小、中文、`runyard`、前台命令、结束后不留进程）；`--terminal-smoke-hold` 做到一半停住，外面强制结束应用，核对 10 秒内不留进程。

## 界面部分（`src/renderer/features/terminal/`，#263）

- `ConsolePanel`（`renderer/app/`）是底部面板：`SegmentedControl` 在“输出”和“终端”之间切，当前页签记在 `panel-mode.ts`（只在这次运行的内存里，每个项目一份；标签页关了就忘掉，所以恢复标签页和重新打开永远从“输出”开始，不自动创建终端）。⌃`、命令面板的 `app.showTerminal`、`app.showOutput` 也在这里接。
- `TerminalView` 显示一个项目的终端：`TerminalSession`（`terminal-session.ts`）把 xterm 6 接到桥的 `terminal.*` 上——先订阅 `terminal.data`/`terminal.state`，再 `terminal.open`，快照写完才放行排队的输出；每段输出写完用 `terminal.ack` 回执；卸载只 `terminal.detach`（终端不结束）。按键归属在 `terminal-keys.ts`：⌘C/⌘V/⌘A/⌘K/⌘F/⌘G 终端自己处理，别的 ⌘ 组合和 ⌃` 原样放行给应用，⌃C 等给 shell。粘贴走 `terminal.paste` 不直接写 shell（括号粘贴由 xterm 按 shell 的设置包）。网址 ⌘ 加点击经 `link.openWeb`（只放行 http、https）。
- 配色、字体、行高在 `terminal-theme.ts`，取自 `@runyard/tokens`（`xtermThemes`、主题表的文字色和滚动条色）；设计稿的行高 21 像素 = 12 号字乘 1.5（xterm 的行高是字高的倍数）。滚动条的胶囊样式在 `TerminalView.module.css` 里覆盖 xterm 的滚动条。
- `FindBar`（⌘F，设计稿 TerminalFind）、右键菜单（用 `Menu` 的 `align="start"`，锚点是鼠标处零大小的元素，打开期间 `useOverlay` 让原生预览让位）、“终端已结束”一行（位置由光标所在行算出）都在 `TerminalView`。
- 关标签页确认（`CloseConfirmDialog`）认 `closeRequest.terminalCommand`/`stopsRun`；⌘Q：`EditorWorkspace` 的 `beforeQuit`（编辑器的保存询问之后）经 `terminal.busy` 问主进程，有命令在运行就弹 `QuitTerminalPrompt`。
- 测试：jsdom 里 xterm 画不出来，`vitest.setup.tsx` 统一把 `@xterm/*` 换成 `test-support/` 里记调用的假类；真实的绘制只在应用里看（对照截图见 PR）。

## 改名、移到废纸篓前的先后顺序（#265）

`ProjectRelease`（`src/main/project-release.ts`）：先让编辑器写入未保存的修改（`project.flushRequested`，应用里发起的自动保存关着会问，取消就整个中止；管理进程请求释放的无处可问，直接写入），再结束终端、放文件监听，改名做完或没做成再把监听接回来。名称框下和移到废纸篓确认里的终端说明靠 `terminal.status`（有没有开着的终端、在运行什么）。在项目自己的终端里 `runyard rm`：终端被结束时请求的命令行跟着没了，管理进程不依赖请求方的连接，项目照样完整移走。
