# desktop/terminal Specification

## Purpose
约定项目标签页里集成终端的行为：每个项目一个终端，用用户的登录 shell，工作目录是项目文件夹；第一次点开底部面板的“终端”才创建；外观跟随设计变量和浅色、深色主题；复制、粘贴、清屏、链接、回滚和查找；终端结束后怎样重新打开；关闭标签页、退出应用、重命名项目、移到废纸篓时怎样结束终端和其中的命令。多个终端标签页是 P1，不在本规格内。

## Requirements

### Requirement: 每个项目一个终端，第一次点开才创建
网页和服务项目标签页的底部面板 MUST 有分段切换“输出”“终端”（与设计稿 WebLight 画板一致），默认选中“输出”；“清除”按钮 MUST 只在“输出”下出现。脚本项目的输出已经在右侧输出区，底部面板 MUST 只有“终端”一页，MUST NOT 有分段切换、“输出”页和“清除”（设计稿 Script）；终端还没创建时，面板里 MUST 写“点这里或按 ⌃` 打开终端”，点它即创建。每个项目 MUST 最多有一个终端。打开项目标签页 MUST NOT 创建终端；第一次切到“终端”（点分段切换，或按 `` ⌃` ``）时 MUST 创建，1 秒内出现提示符，工作目录是项目文件夹。之后切回“输出”、切到别的标签页、再切回来，MUST 是同一个终端：内容、命令历史和正在运行的命令都在；终端不显示时里面的命令 MUST 继续运行、输出照常记录。`` ⌃` `` 在焦点不在终端时 MUST 切到“终端”并把焦点放进去；焦点已在终端时 MUST 把焦点还给编辑器，分段切换保持在“终端”。重新打开应用恢复标签页时 MUST NOT 自动创建终端，底部面板显示“输出”；上次终端里的内容 MUST NOT 保留。
来源：PRD #prd-terminal；PRD #prd-restore-tabs；PRD #prd-request-panel

#### Scenario: [DESKTOP-TERMINAL-01] 第一次点“终端”才创建
- 前提：打开了项目 `demo` 的标签页，底部面板显示“输出”
- **WHEN** 等 3 秒，然后点分段切换里的“终端”
- **THEN** 点之前没有为 `demo` 启动任何 shell；点之后 1 秒内出现提示符，在终端里执行 `pwd` 输出 `demo` 的项目文件夹路径
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-02] 每个项目一个，各在自己的文件夹
- 前提：`demo` 和 `api` 两个项目标签页都开过终端
- **WHEN** 分别在两个终端里执行 `pwd`
- **THEN** 各自输出自己项目的文件夹；两个终端是不同的 shell 进程
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-03] 切走再回来是同一个终端
- 前提：在 `demo` 的终端里执行过 `echo hello`
- **WHEN** 切回“输出”，再切到资源库页面，然后回到 `demo` 并切到“终端”
- **THEN** `hello` 还在；按上方向键调出的上一条命令是 `echo hello`；shell 的进程号没有变
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-04] 不显示时命令继续运行
- 前提：`demo` 的终端里执行了 `sleep 2; echo done`
- **WHEN** 马上切回“输出”，3 秒后再切到“终端”
- **THEN** 终端里有 `done`，下一个提示符已经出现
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-05] `` ⌃` `` 在编辑器和终端之间切换焦点
- 前提：焦点在编辑器里，`demo` 还没有终端
- **WHEN** 按 `` ⌃` ``，输入 `echo hi` 并回车，再按 `` ⌃` ``
- **THEN** 第一次按下后底部面板切到“终端”、终端被创建并获得焦点，`echo hi` 在终端里执行；第二次按下后焦点回到编辑器原来的光标位置，底部面板仍显示“终端”
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-06] 重新打开应用不自动开终端
- 前提：上次退出应用前，`demo` 的标签页开着终端
- **WHEN** 重新打开应用，`demo` 的标签页被恢复并显示
- **THEN** 底部面板显示“输出”，没有为 `demo` 启动 shell；点“终端”后出现一个新的终端，里面没有上次的内容
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-39] 脚本项目的底部只有终端
- 前提：打开 Python 脚本项目 `python-2` 的标签页
- **WHEN** 查看底部面板
- **THEN** 面板收成一行 36px 的标题条，标题是“终端”，右边是“打开终端 ⌃`”按钮，没有“输出”页、分段切换和“清除”，原来的高度还给编辑器和输出；还没有为 `python-2` 启动 shell
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-40] 脚本项目点一下就开终端
- 前提：同上
- **WHEN** 点标题条上的“打开终端”
- **THEN** 1 秒内出现提示符，工作目录是 `python-2` 的项目文件夹
- 验证：test

### Requirement: 用用户的登录 shell 和真实环境
终端 MUST 以登录方式运行用户的登录 shell（取自系统的用户记录，不依赖应用自己的环境变量），工作目录是项目文件夹。终端里的环境 MUST 与用户在系统终端里打开的环境一致：用户在 shell 启动文件里配置的工具（如 nvm 提供的 `node`）MUST 能用。终端里 MUST 能直接使用 `runyard` 命令（即使用户还没有把命令行工具装到系统里），用的是与这个应用同一版本的命令行。终端 MUST 按 UTF-8 收发文字，中文能正确显示和用输入法输入；MUST 声明支持 256 色和真彩色。登录 shell 启动失败（文件不存在、不能执行、立刻退出）时 MUST 改用系统自带的 `/bin/zsh`，并在终端第一行写明没能启动哪个 shell 和原因。
来源：PRD #prd-terminal；PRD #prd-release-plan

#### Scenario: [DESKTOP-TERMINAL-07] 用登录 shell
- 前提：用户的登录 shell 是 `/bin/zsh`；应用是从访达启动的，自己的环境变量里没有 `SHELL`
- **WHEN** 打开终端，执行 `echo $0`
- **THEN** 输出 `-zsh`（以登录方式启动的 zsh）
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-08] 启动文件里配置的工具能用
- 前提：`node` 只由用户 `.zshrc` 里加载的 nvm 提供，应用自己的 `PATH` 里没有它
- **WHEN** 在终端里执行 `node -v`
- **THEN** 输出与用户在系统终端里执行的结果相同
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-09] `runyard` 命令一定能用
- 前提：用户没有在设置里安装命令行工具，系统 `PATH` 里没有 `runyard`
- **WHEN** 在终端里执行 `runyard --version`
- **THEN** 输出与应用相同的版本号，退出码 0
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-10] 中文显示和输入
- 前提：项目里有文件 `笔记.md`
- **WHEN** 在终端里执行 `ls`，再用中文输入法输入 `echo 你好` 并回车
- **THEN** `笔记.md` 显示正确；输入法的候选词确认后才进入命令行，输出 `你好`，没有乱码
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-11] 登录 shell 起不来时改用 zsh
- 前提：用户记录里的登录 shell 是 `/usr/local/bin/fish`，这个文件不存在
- **WHEN** 打开终端
- **THEN** 终端第一行写明没能启动 `/usr/local/bin/fish` 及原因，随后出现 `/bin/zsh` 的提示符，工作目录是项目文件夹
- 验证：test

### Requirement: 外观跟随设计变量和主题
终端的背景、文字、光标、选区和 16 种标准颜色 MUST 来自设计变量，浅色和深色各一套；切换应用主题时 MUST 立即换配色，MUST NOT 重启 shell 或清掉内容。字体、字号、行高、内边距 MUST 与设计稿 Script、WebLight 画板一致；滚动条 MUST 用 `@runyard/ui` 的统一滚动条样式。终端的行数和列数 MUST 跟着底部面板的大小变化（拖动面板上沿、调整窗口），全屏程序（如 `vim`、`top`）MUST 按新大小重画。
来源：PRD #prd-terminal；PRD #prd-editor

#### Scenario: [DESKTOP-TERMINAL-12] 主题切换立即生效
- 前提：应用是浅色，终端里有带颜色的输出（`printf '\e[31m红\e[0m'`）
- **WHEN** 把应用主题换成深色
- **THEN** 终端立即换成深色的背景和文字，红字换成深色配色里的红色；内容和 shell 进程都没有变
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-13] 与设计稿一致
- **WHEN** 在浅色、深色、中文、英文下打开 Script 画板对应状态的终端，与设计稿并排比较
- **THEN** 分段切换、字体、字号、行高、内边距、提示符颜色、光标样式一致，滚动条是统一样式
- 验证：manual（视觉还原，按设计稿对照截图，自动测试只覆盖配色数值）

#### Scenario: [DESKTOP-TERMINAL-14] 面板变大，行列跟着变
- 前提：终端开着，执行 `stty size` 输出 `10 120`
- **WHEN** 把底部面板的上沿向上拖 120 像素，再执行 `stty size`
- **THEN** 行数变多、列数不变；正在运行的 `top` 按新大小重画，没有错位
- 验证：test

### Requirement: 复制、粘贴、清屏、链接和快捷键
焦点在终端里时：`⌘C` MUST 复制选中的文字，没有选中时 MUST NOT 做任何事（MUST NOT 发中断）；`⌃C` 等 Control 组合键 MUST 原样交给 shell；`⌘V` MUST 把剪贴板里的文字作为输入粘贴进去，多行文字 MUST 以“括号粘贴”方式交给 shell（支持它的 shell 不会逐行立即执行）；`⌘A` MUST 选中全部内容；`⌘K` MUST 清掉屏幕和回滚内容、shell 不受影响。右键 MUST 弹出应用内的菜单（外观按设计稿 TerminalMenu，打开期间原生预览让位）：复制、粘贴、全选、清除。输出里的网址 MUST 在按住 `⌘` 悬停时显示下划线，`⌘` 加点击 MUST 用系统默认浏览器打开；普通点击 MUST 只做选择。应用级快捷键（如 `⌘⇧P`、`⌘P`、`⌘W`、`⌘S`、`⌘N`）在焦点在终端里时 MUST 照常生效，不被终端吞掉。
来源：PRD #prd-terminal；PRD #prd-editor

#### Scenario: [DESKTOP-TERMINAL-15] `⌘C` 复制，`⌃C` 中断
- 前提：终端里正在运行 `sleep 100`，屏幕上有一行 `hello`
- **WHEN** 选中 `hello` 按 `⌘C`；取消选中再按 `⌘C`；然后按 `⌃C`
- **THEN** 剪贴板里是 `hello`；没有选中时按 `⌘C` 后 `sleep` 仍在运行；按 `⌃C` 后 `sleep` 被中断，出现新的提示符
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-16] `⌘V` 粘贴多行不逐行执行
- 前提：剪贴板里是两行 `echo a` 和 `echo b`，shell 是 zsh
- **WHEN** 在终端里按 `⌘V`
- **THEN** 两行文字出现在命令行里但没有执行；按回车后才依次输出 `a`、`b`
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-17] `⌘K` 清屏
- 前提：终端里有 200 行输出，shell 的进程号是 P
- **WHEN** 按 `⌘K`
- **THEN** 屏幕和回滚内容都清空，只剩当前的提示符；shell 的进程号仍是 P，命令历史还在
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-18] 右键菜单
- **WHEN** 在终端里右键
- **THEN** 弹出应用内的菜单（按设计稿 TerminalMenu），依次是复制、粘贴、全选、清除，右侧写快捷键；没有选中文字时“复制”不可用；右键不改变已有的选区
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-19] `⌘` 加点击打开网址
- 前提：终端里输出了 `http://127.0.0.1:5173/`
- **WHEN** 普通点击这个网址；然后按住 `⌘` 点击它
- **THEN** 普通点击只放下光标或选择文字；`⌘` 加点击用系统默认浏览器打开这个地址
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-20] 应用快捷键在终端里照常
- 前提：焦点在终端里
- **WHEN** 按 `⌘P`，按 `Esc`，再按 `⌘⇧P`
- **THEN** 依次打开快速打开和命令面板，没有任何字符被送进 shell
- 验证：test

### Requirement: 回滚与查找
终端 MUST 保留最近 10000 行回滚内容，更早的丢弃。用户向上滚动查看时有新的输出，视图 MUST 停在原处，MUST NOT 跳到底部；用户开始输入时 MUST 回到底部。焦点在终端里时 `⌘F` MUST 在终端右上角打开查找栏，在可见内容和回滚内容里查找，支持区分大小写、全词、正则，高亮全部结果；`⌘G`、`回车` MUST 跳到下一个，`⇧⌘G`、`⇧回车` 跳到上一个，并显示“第 N 个，共 M 个”；`Esc` MUST 关闭查找栏并把焦点还给终端。大量输出时界面 MUST 保持可操作。
来源：PRD #prd-terminal；PRD #prd-quality

#### Scenario: [DESKTOP-TERMINAL-21] 保留最近 10000 行
- **WHEN** 在终端里执行 `seq 1 20000`，然后滚到最上面
- **THEN** 能滚到的最早一行大约是 `10000`（相差不超过一屏的行数）；`1` 到 `9000` 都已看不到，`10000` 到 `20000` 都在
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-22] 向上看时不被新输出拉走
- 前提：终端里正在每秒打印一行
- **WHEN** 向上滚动 50 行，等 3 秒，再敲一个字母
- **THEN** 等待期间视图停在原处；敲字母后回到底部
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-23] 在终端里查找
- 前提：终端里（含回滚内容）有 3 处 `error`
- **WHEN** 焦点在终端里按 `⌘F`，输入 `error`，按两次 `⌘G`，再按 `Esc`
- **THEN** 3 处都被高亮，显示“第 1 个，共 3 个”，按 `⌘G` 后依次到第 2、3 个并滚动到可见处；按 `Esc` 后查找栏关闭、高亮消失，焦点回到终端
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-24] 大量输出时界面不卡
- **WHEN** 在终端里执行一条持续 10 秒、每秒输出几万行的命令，期间切换文件标签、在编辑器里输入
- **THEN** 切换和输入都及时响应，没有明显停顿；命令结束后终端显示最后的输出
- 验证：manual（性能，要在打包后的应用上看，自动测试环境的计时不代表真实速度）

### Requirement: 终端结束后重新打开
终端里的 shell 退出（如执行 `exit`）时，终端 MUST 保留已有内容，在最后写“终端已结束（退出码 N）”，并显示“重新打开终端”按钮；按钮或在终端里按回车 MUST 在项目文件夹里开一个新的终端。负责终端的后台进程意外结束时，所有项目的终端 MUST 显示“终端意外结束”和“重新打开终端”，编辑器、文件树、预览和运行 MUST NOT 受影响。
来源：PRD #prd-terminal

#### Scenario: [DESKTOP-TERMINAL-25] `exit` 之后重新打开
- **WHEN** 在终端里执行 `exit`，然后点“重新打开终端”
- **THEN** 执行后终端保留原有内容，最后写“终端已结束（退出码 0）”和“重新打开终端”按钮；点按钮后出现新的提示符，`pwd` 是项目文件夹
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-26] 终端的后台进程意外结束
- 前提：`demo` 和 `api` 都开着终端，`demo` 的运行处于 `ready`，编辑器里 `App.tsx` 有未保存的修改
- **WHEN** 负责终端的后台进程被强制结束
- **THEN** 两个终端都显示“终端意外结束”和“重新打开终端”；`demo` 的运行仍是 `ready`，`App.tsx` 的修改还在，预览照常；点“重新打开终端”后能正常使用
- 验证：test

### Requirement: 关闭标签页、退出应用时结束终端
关闭项目标签页 MUST 结束这个项目的终端，包括 shell 和在里面启动的命令（含后台作业），3 秒内不留下进程；`⌘Q` 退出应用 MUST 结束所有终端，5 秒内不留下进程。关闭窗口 MUST NOT 结束终端（与运行一样，desktop/workspace）。应用被强制结束时，终端里的 shell 和前台命令 MUST 在 10 秒内结束。终端里通过 `runyard` 启动的运行是命令行持有的，MUST NOT 因终端结束而停止。

终端只有空闲的 shell（没有命令在运行）时，关闭标签页和退出应用 MUST NOT 为终端多问。终端里有命令在运行时：关闭这个项目标签页 MUST 先确认，写明“终端里还在运行 <命令名>，关闭会结束它”，按钮“取消”和“关闭”；这个项目的运行也在运行时，两句话 MUST 合在同一个确认里；“不再提示”只管运行那一句，终端里有命令在运行时 MUST 照样确认。`⌘Q` 时任何项目的终端里有命令在运行，MUST 弹一个确认，列出这些项目和命令，按钮“取消”和“退出”；它 MUST 在编辑器的“保存／不保存／取消”询问之后出现。选“取消”MUST 什么都不结束、不停止。
来源：PRD #prd-terminal；PRD #prd-run-ownership；PRD #prd-close-tab-confirm

#### Scenario: [DESKTOP-TERMINAL-27] 关闭标签页结束终端和里面的命令
- 前提：`demo` 的终端里先执行了 `sleep 1000 &`，`demo` 的运行已停止
- **WHEN** 关闭 `demo` 的标签页
- **THEN** 3 秒内 `demo` 的 shell 和那个 `sleep` 都已不在
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-28] 空闲的 shell 不多问
- 前提：`demo` 的终端停在提示符，`demo` 的运行已停止
- **WHEN** 关闭 `demo` 的标签页
- **THEN** 没有确认，标签页直接关闭
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-29] 终端里有命令在运行时先确认
- 前提：`demo` 的运行处于 `ready`，用户以前勾过“不再提示”；终端里正在运行 `pnpm install`
- **WHEN** 关闭 `demo` 的标签页，先选“取消”，再关一次选“关闭”
- **THEN** 弹出确认，写明终端里还在运行 `pnpm`、关闭会结束它，也写明会停止运行；选“取消”后标签页、运行和 `pnpm install` 都在；选“关闭”后运行停止、`pnpm install` 被结束
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-30] `⌘Q` 时有命令在运行
- 前提：`demo` 的终端里正在运行 `tail -f log.txt`，`api` 的终端空闲
- **WHEN** 按 `⌘Q`，先选“取消”，再按一次 `⌘Q` 选“退出”
- **THEN** 确认里只列出 `demo` 和 `tail`；选“取消”后应用没有退出，所有终端和运行都在；选“退出”后 5 秒内所有终端和标签页持有的运行都已结束
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-31] 关闭窗口不结束终端
- 前提：`demo` 的终端里正在运行 `sleep 100`
- **WHEN** 点窗口左上角的红色关闭按钮，再点 Dock 图标
- **THEN** 窗口回来，`demo` 的终端还是原来那个，`sleep` 仍在运行
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-32] 应用被强制结束
- 前提：`demo` 的终端里正在运行 `sleep 1000`
- **WHEN** 应用被强制结束
- **THEN** 10 秒内 `demo` 的 shell 和 `sleep` 都已不在
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-33] 终端里启动的命令行运行不受影响
- 前提：在 `demo` 的终端里执行 `runyard run api`，`api` 进入 `ready`，持有者是命令行
- **WHEN** 关闭 `demo` 的标签页
- **THEN** `demo` 的终端结束；`api` 仍是 `ready`，持有者仍是命令行
- 验证：test

### Requirement: 重命名、移到废纸篓时结束终端
重命名项目和把项目移到废纸篓（无论从资源库、工作区、命令行还是自动清理发起）MUST 先结束这个项目的终端，再改名或移走，终端 MUST NOT 停在一个已不存在的文件夹里。在应用里重命名时，这个项目开着终端的，名称框下的说明 MUST 追加“这个项目的终端会被关闭”（终端里有命令在运行时写“终端里正在运行的 <命令名> 会被结束”）；改名后，标签页里的终端 MUST 显示“项目已改名，终端已关闭”和“重新打开终端”，重新打开的终端在新文件夹里。在应用里移到废纸篓时，终端里有命令在运行的，确认弹窗 MUST 追加“终端里还在运行 <命令名>，会被结束”。由命令行在这个项目自己的终端里发起移到废纸篓时，项目 MUST 照样被移到废纸篓。
来源：PRD #prd-workspace-menu；PRD #prd-rename；PRD #prd-decision-table

#### Scenario: [DESKTOP-TERMINAL-34] 重命名前提示并关闭终端
- 前提：`demo` 的标签页开着终端，终端空闲
- **WHEN** 在工作区里选“重命名…”，改为 `demo2` 并保存，然后点“重新打开终端”并执行 `pwd`
- **THEN** 弹窗的说明里有“这个项目的终端会被关闭”；保存后旧的 shell 已不在，终端显示“项目已改名，终端已关闭”；重新打开后 `pwd` 是 `demo2` 的文件夹
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-35] 重命名时终端里有命令在运行
- 前提：`demo` 的终端里正在运行 `tail -f log.txt`
- **WHEN** 在资源库里对 `demo` 选“重命名…”
- **THEN** 名称框下的说明写明终端里正在运行的 `tail` 会被结束；保存后 `tail` 和 shell 都已不在，文件夹已改名
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-36] 移到废纸篓前结束终端
- 前提：`demo` 的终端里正在运行 `pnpm install`
- **WHEN** 选“移到废纸篓”
- **THEN** 确认弹窗里有“终端里还在运行 pnpm，会被结束”；确认后先结束终端，再把文件夹移到废纸篓，没有因文件夹被占用而失败
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-37] 命令行发起的移到废纸篓也先结束终端
- 前提：`demo` 的标签页开着终端，终端空闲
- **WHEN** 智能体在系统终端里执行 `runyard rm demo`
- **THEN** 应用先结束 `demo` 的终端，`demo` 被移到废纸篓，命令成功返回；`demo` 的标签页关闭
- 验证：test

#### Scenario: [DESKTOP-TERMINAL-38] 在项目自己的终端里把它移到废纸篓
- 前提：`demo` 的标签页开着终端
- **WHEN** 在 `demo` 自己的终端里执行 `runyard rm demo`
- **THEN** `demo` 被移到废纸篓，标签页关闭，`demo` 的 shell 已不在；没有留下半途而废的状态（项目要么完整在废纸篓里，要么完整留在资源库里）
- 验证：test
