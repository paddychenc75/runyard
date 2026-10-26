# 演示视频分镜（#563）

一段 80 秒的产品演示，放在官网首屏“看演示视频”和 README 里。以后用 Remotion 按这份分镜拼起来。**画面全部来自真实应用**：截图或录屏，不画假界面；字幕、箭头、放大框这些叠加层可以由 Remotion 画。

## 通用规则

- 画幅 1920×1080，30 帧每秒；另出一份 1080×1350（4:5）给社交平台，裁切位置在每一镜的“画面”里注明重点区域。
- 录制环境：一个干净的资源库（用临时 `--root`，不碰真实的 `~/Runyard`），窗口 1440×900，系统浅色；深色只在第 11 镜出现一次。项目名、备注用下面写定的，好让字幕对得上。
- 录屏用真实操作，速度不加快超过 1.5 倍；等待依赖安装的部分剪掉，剪辑点用 6 帧交叉淡化。
- 字幕：底部居中，两行以内，中文一版、英文一版各出一个视频（不叠双语）。字体用系统字体，白字加 60% 黑底条，圆角 12。
- 鼠标指针保留，点击时加一个 200ms 的浅色圆圈。
- 转场默认：硬切或 6 帧交叉淡化。放大用 Remotion 对录屏做 `scale`（最多 1.6 倍），缓动 `cubic-bezier(0.2, 0, 0, 1)`，400ms。
- 背景音乐：轻、无人声，-18 LUFS 左右；没有旁白（字幕即可）。

## 要录的画面清单

按录制顺序。名字在括号里的是对应设计稿，录之前先对照，确认应用和稿子一致。

| 编号 | 应用状态 | 怎么得到 |
| --- | --- | --- |
| A | 启动画面到空资源库（Brand、Empty） | 用空的临时目录启动应用，录启动全过程 |
| B | 选模板弹窗，鼠标停在 React 19（Picker） | 点“新建” |
| C | 新建弹窗填名称 `pricing-table`，备注“价格表布局试验”（CreateDialog） | 选 React 19 后填写 |
| D | 启动过程到预览出现（Creating → WebLight） | 点“创建”，录到页面出现；依赖已缓存，约一秒 |
| E | 编辑 `src/App.tsx`：把标题改成 `Pricing`，⌘S，预览立刻变（WebLight） | 在编辑器里打字 |
| F | 终端面板里执行 `ls`（Terminal） | 打开底部终端 |
| G | 服务项目：用 `hono` 模板建 `todo-api`，请求面板发 `GET /todos`，看到响应（Service） | 新建 Hono 项目 |
| H | 应用内置终端或系统终端里执行 `runyard new react19 chart-demo --run --note "图表试验" --json`，输出 JSON（命令行） | 命令行由应用安装到 PATH |
| I | 资源库里出现带“智能体”徽标的 `chart-demo`，运行中排最前（AgentActivity、LibraryRunning） | H 的结果；用 Claude Code 真实执行一次更好，徽标会写明智能体名 |
| J | 运行中列表（RunningPopover），然后对一个项目“停止运行” | 点顶栏“N 个运行中” |
| K | 行菜单：编辑备注、自动清理、移到废纸篓（RowMenu、AutoCleanDialog） | 点某一行的“更多” |
| L | 同一个资源库的深色外观（MainDark） | 系统切到深色后截一张 |
| M | 设置页“智能体技能包”一行，已装到 Claude Code、Codex（Settings） | 打开设置 |

## 分镜

| # | 时间 | 画面 | 字幕（中文） | 字幕（英文） | 转场进入 |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00–0:05 | 黑底，图标居中，执行线从左到右走一次后冲出边缘（与官网顶部动画同一动作，用 `logo/final/icon.svg` 制作）；下方出现“Runyard” | （无） | （无） | 淡入 |
| 2 | 0:05–0:10 | 录屏 A：启动画面 → 空资源库 | 存放和运行代码示例的 Mac 应用 | The Mac app for keeping and running code samples | 交叉淡化 |
| 3 | 0:10–0:20 | 录屏 B、C：点“新建”，选 React 19，填名称和备注。放大到弹窗 1.3 倍 | 选一个模板，起个名字 | Pick a template, give it a name | 硬切 |
| 4 | 0:20–0:27 | 录屏 D：点“创建”，约一秒后预览出现。屏幕角落叠一个计时“1.2 秒”（数值取录屏里的真实耗时） | 一秒左右，项目就跑起来了 | About a second later, it is running | 硬切 |
| 5 | 0:27–0:37 | 录屏 E：改标题，⌘S，预览立刻更新。放大到编辑器和预览之间 | 改代码，马上看到结果 | Edit the code, see the result | 交叉淡化 |
| 6 | 0:37–0:42 | 录屏 F：底部终端执行 `ls` | 终端就在下面 | The terminal is right below | 硬切 |
| 7 | 0:42–0:50 | 录屏 G：Hono 项目，请求面板发 `GET /todos`，响应出现 | 服务项目：直接发请求、看响应 | Services: send a request, read the response | 交叉淡化 |
| 8 | 0:50–0:60 | 录屏 H：终端里一条命令，JSON 输出逐行出现（真实输出，不改） | 智能体用一条命令新建并运行 | Agents create and run with one command | 硬切 |
| 9 | 0:60–0:67 | 录屏 I：切回资源库，`chart-demo` 带“智能体”徽标排在最前。放大到徽标 1.6 倍 | 你看得见它建了什么 | You see what it made | 交叉淡化 |
| 10 | 0:67–0:73 | 录屏 J、K 快剪：运行中列表 → 停止运行 → 行菜单里“自动清理”“移到废纸篓” | 每个项目都是普通文件夹，好找、好清理 | Every playground is a plain folder, easy to find and tidy | 硬切，每段 2 秒 |
| 11 | 0:73–0:76 | 截图 L 与 M：资源库浅色 → 深色横向擦除；然后设置页技能包一行 | 深浅色，中英文；技能包一键装好 | Light and dark, Chinese and English; skills in one click | 横向擦除 400ms |
| 12 | 0:76–0:80 | 白底（深色版用 `color-bg-window` 深色值），图标、“Runyard”、`paddychenc75.github.io/runyard`、“免费开源 · macOS” | 免费下载 | Free download | 交叉淡化，结尾停 1 秒 |

总长 80 秒。要剪到 60 秒时，去掉第 6、11 镜，第 10 镜缩到 4 秒，第 3 镜缩到 7 秒。

## 交付给 Remotion 实现的东西

- 上表 A–M 的录屏（`.mov`，原始分辨率）和截图（`.png`，2 倍），浅色为主，L 为深色；文件名用编号开头，如 `D-create-to-preview.mov`。
- 每段录屏的入点、出点（秒），写在一张表里，和本分镜的镜号对应。
- 中英文字幕各一份，以本表为准；改字幕时同时改这份文件。
