# desktop/editor Specification

## Purpose
约定项目标签页里编辑器的行为：文件树（新建、重命名、移到废纸篓）、文件标签（编辑器里每个打开的文件一个，区别于项目的标签页）、自动保存三档、文件被外部修改时怎么办、语法高亮（包括 Vue 单文件组件）、TypeScript 和 JavaScript 的智能提示，以及编辑后预览、输出怎样跟着变。“实时”由磁盘上的文件变化驱动，编辑器保存和智能体、命令行写文件的效果一致；各运行器自己的重新加载规则见 templates/runners 和 run/scripts，本规格只管应用里看得见的部分。终端、命令面板和快速打开不在本规格内。

## Requirements

### Requirement: 打开项目时显示文件树和入口文件
打开一个项目的标签页时，工作区 MUST 显示这个项目文件夹的文件树（文件夹在前，同类按名称排序），并在编辑器里打开项目记录的默认打开文件（没有记录时打开模板的入口文件）。文件树 MUST NOT 显示 `.runyard` 和 `.git`；依赖目录（`node_modules`）MUST 显示为折叠的文件夹，展开时才读取其中的内容。项目文件夹里的文件被新建、删除、改名后，文件树 MUST 在 2 秒内自动更新，不需要手动刷新。
来源：PRD #prd-editor；PRD #prd-quality

#### Scenario: [DESKTOP-EDITOR-01] 打开项目显示文件树和入口文件
- 前提：项目 `demo` 用 `react19` 模板创建，默认打开文件是 `src/App.tsx`
- **WHEN** 打开 `demo` 的标签页
- **THEN** 文件树列出项目文件夹的内容，文件夹在前；编辑器打开 `src/App.tsx`，它的文件标签处于选中状态，文件树里它被高亮
- 验证：test

#### Scenario: [DESKTOP-EDITOR-02] 隐藏内部文件夹，依赖目录折叠
- 前提：项目里有 `.runyard`、`.git`、`node_modules`
- **WHEN** 查看文件树
- **THEN** 没有 `.runyard` 和 `.git`；`node_modules` 显示为折叠的文件夹，展开后才列出其中的内容
- 验证：test

#### Scenario: [DESKTOP-EDITOR-03] 文件树随磁盘变化更新
- 前提：`demo` 的标签页开着
- **WHEN** 命令行在项目里新建 `src/new.ts`，并删除 `src/old.ts`
- **THEN** 2 秒内文件树出现 `new.ts`、不再有 `old.ts`，没有手动刷新
- 验证：test

#### Scenario: [DESKTOP-EDITOR-04] 创建后很快看到编辑器
- 前提：资源库根目录在本机磁盘上，模板文件已在本机
- **WHEN** 在新建弹窗里回车创建项目
- **THEN** 150 ms 内项目标签页里的编辑器显示入口文件的内容（不等依赖安装和启动）
- 说明：应用启动时就预加载 Monaco（K8 实测，负责人 2026-10-17 决定），所以创建项目时不再等编辑器引擎加载；这是达到 150 ms 的做法，不是另一条要求
- 验证：manual（性能目标，在打包后的应用上量，单元测试环境的计时不代表真实速度）

### Requirement: 文件树里新建、重命名、移到废纸篓
文件树 MUST 支持在任一文件夹（含项目根）下新建文件和新建文件夹、重命名文件和文件夹、把文件和文件夹移到废纸篓；这些操作 MUST 既能从右键菜单做，也能只用键盘做。新名字 MUST 在原处的输入框里填写：同一文件夹里已有同名项时 MUST 提示已存在、MUST NOT 创建或覆盖；名字为空、含 `/`、是 `.` 或 `..` 时 MUST 拒绝并说明；结果路径 MUST 仍在项目文件夹内。重命名后，已打开的相关文件标签 MUST 跟着换成新路径，未保存的修改 MUST 保留。移到废纸篓 MUST NOT 弹确认；移走前 MUST 先把该文件（或文件夹里打开的文件）未保存的修改写入磁盘，移走后关闭相关的文件标签，并显示一条“已移到废纸篓”的提示。放不进废纸篓时 MUST 失败并说明原因，文件 MUST 留在原处，MUST NOT 改成永久删除。
来源：PRD #prd-editor；PRD #prd-workspace-menu

#### Scenario: [DESKTOP-EDITOR-05] 新建文件
- 前提：文件树里 `src` 文件夹没有 `utils.ts`
- **WHEN** 在 `src` 上选“新建文件”，输入 `utils.ts` 后回车
- **THEN** 磁盘上出现空文件 `src/utils.ts`，文件树选中它，编辑器为它打开文件标签
- 验证：test

#### Scenario: [DESKTOP-EDITOR-06] 新建文件夹
- **WHEN** 在项目根上选“新建文件夹”，输入 `lib` 后回车
- **THEN** 磁盘上出现空文件夹 `lib`，文件树里显示它
- 验证：test

#### Scenario: [DESKTOP-EDITOR-07] 同名时不创建也不覆盖
- 前提：`src` 里已有 `utils.ts`，内容非空
- **WHEN** 在 `src` 里新建文件，输入 `utils.ts` 后回车
- **THEN** 输入框旁提示已存在同名文件，输入框保留；磁盘上的 `utils.ts` 内容不变
- 验证：test

#### Scenario: [DESKTOP-EDITOR-08] 不合法的名字被拒绝
- **WHEN** 新建或重命名时输入空名字、`a/b`、`.` 或 `..`
- **THEN** 提示名字不可用并说明原因，磁盘上没有任何变化，也没有在项目文件夹之外创建任何东西
- 验证：test

#### Scenario: [DESKTOP-EDITOR-09] 重命名已打开、有未保存修改的文件
- 前提：`src/App.tsx` 已打开且有未保存的修改，自动保存设为“关闭”
- **WHEN** 在文件树里把它重命名为 `Main.tsx`
- **THEN** 磁盘上只有 `src/Main.tsx`；文件标签的标题变为 `Main.tsx`，未保存的修改还在；按 `⌘S` 后写入的是 `src/Main.tsx`
- 验证：test

#### Scenario: [DESKTOP-EDITOR-10] 重命名文件夹
- 前提：`src/components/Button.tsx` 已打开
- **WHEN** 把 `src/components` 重命名为 `src/ui`
- **THEN** 文件标签指向 `src/ui/Button.tsx`，内容和光标位置不变
- 验证：test

#### Scenario: [DESKTOP-EDITOR-11] 移到废纸篓
- 前提：`src/old.ts` 已打开，没有未保存的修改
- **WHEN** 在文件树里选中它，按 `⌘⌫`
- **THEN** 不弹确认；文件进入废纸篓，文件树里不再有它，它的文件标签关闭，出现“已移到废纸篓”的提示
- 验证：test

#### Scenario: [DESKTOP-EDITOR-12] 移到废纸篓前先保存
- 前提：`src/old.ts` 有未保存的修改
- **WHEN** 把它移到废纸篓
- **THEN** 废纸篓里的这个文件含有那些修改
- 验证：test

#### Scenario: [DESKTOP-EDITOR-13] 放不进废纸篓时失败
- 前提：`src/locked.ts` 无法移到废纸篓
- **WHEN** 把它移到废纸篓
- **THEN** 提示失败并写明原因；文件仍在原处，没有被永久删除，文件标签不受影响
- 验证：test

#### Scenario: [DESKTOP-EDITOR-14] 只用键盘操作文件树
- 前提：焦点在文件树上
- **WHEN** 用方向键移到 `src/App.tsx` 并按回车，再在另一个文件上用快捷键开始重命名、输入新名字并回车
- **THEN** 回车打开了 `App.tsx`；重命名完成；整个过程没有用到鼠标，焦点位置始终看得见
- 验证：test

### Requirement: 文件标签
在文件树里打开一个文件 MUST 为它新开一个文件标签；这个文件已有文件标签时 MUST 切到那个标签而不是再开一个。有未保存修改的文件标签 MUST 显示未保存标记，编辑器的状态区 MUST 显示“未保存”，写入磁盘后 MUST 显示“已保存”。焦点在项目标签页里时，`⌘W` MUST 先关闭当前的文件标签；项目里已经没有文件标签时，`⌘W` 才关闭项目标签页（照 desktop/workspace 的规则，运行中的要确认）。关闭一个有未保存修改的文件标签时：自动保存是“延迟”或“失去焦点时”的，MUST 先写入再关闭，MUST NOT 询问；自动保存是“关闭”的，MUST 询问“保存”“不保存”“取消”。下次打开同一个项目时，MUST 恢复上次打开的文件标签和当前选中的那个；已不存在的文件 MUST 跳过。不是文本的文件 MUST NOT 在编辑器里打开，而是说明原因并提供“在访达中显示”；大小不超过 1 MB 的文本文件 MUST 有完整的语法高亮；超过 1 MB 但不超过 5 MB 的 MUST 能当纯文本编辑、MUST NOT 做语法高亮，并说明原因；超过 5 MB 的文本文件 MUST 打开但关闭高亮和智能提示并说明；超过 50 MB 的 MUST NOT 打开，提供“在外部编辑器中打开”。
来源：PRD #prd-editor；PRD #prd-close-tab-confirm

#### Scenario: [DESKTOP-EDITOR-15] 同一个文件只开一个标签
- 前提：`src/App.tsx` 已有文件标签，当前选中的是 `src/main.tsx`
- **WHEN** 在文件树里再次打开 `src/App.tsx`
- **THEN** 切到已有的 `App.tsx` 标签，文件标签的数量不变
- 验证：test

#### Scenario: [DESKTOP-EDITOR-16] 未保存标记与“已保存”
- 前提：自动保存设为“关闭”
- **WHEN** 在 `App.tsx` 里输入一个字符，再按 `⌘S`
- **THEN** 输入后文件标签带未保存标记、状态区显示“未保存”；按 `⌘S` 后标记消失、状态区显示“已保存”
- 验证：test

#### Scenario: [DESKTOP-EDITOR-17] `⌘W` 先关文件标签
- 前提：项目标签页持有的运行处于 `ready`，编辑器里有 `App.tsx` 和 `main.tsx` 两个文件标签，没有未保存的修改
- **WHEN** 焦点在编辑器里，按三次 `⌘W`
- **THEN** 前两次各关闭一个文件标签，运行仍是 `ready`；第三次才开始关闭项目标签页，弹出 desktop/workspace 的关闭确认
- 验证：test

#### Scenario: [DESKTOP-EDITOR-18] 自动保存开着时关闭直接保存
- 前提：自动保存是“延迟 1 秒后”，`App.tsx` 刚输入了内容、还没到 1 秒
- **WHEN** 关闭 `App.tsx` 的文件标签
- **THEN** 没有询问；磁盘上的 `App.tsx` 含有刚输入的内容
- 验证：test

#### Scenario: [DESKTOP-EDITOR-19] 自动保存关闭时询问
- 前提：自动保存是“关闭”，`App.tsx` 有未保存的修改
- **WHEN** 关闭它的文件标签
- **THEN** 询问“保存”“不保存”“取消”；选“取消”时文件标签和修改都在；选“不保存”时文件标签关闭、磁盘不变；选“保存”时写入后关闭
- 验证：test

#### Scenario: [DESKTOP-EDITOR-20] 重新打开项目恢复文件标签
- 前提：上次关闭 `demo` 时打开着 `App.tsx`、`App.css`、`main.tsx`，选中 `App.css`；之后 `main.tsx` 在外部被删除
- **WHEN** 再次打开 `demo`
- **THEN** 有 `App.tsx`、`App.css` 两个文件标签，选中 `App.css`；没有 `main.tsx` 的标签
- 验证：test

#### Scenario: [DESKTOP-EDITOR-21] 不是文本的文件
- **WHEN** 在文件树里打开 `public/logo.png`
- **THEN** 编辑器区说明这个文件不是文本、不能在编辑器里打开，并提供“在访达中显示”；没有把二进制内容当文字显示
- 验证：test

#### Scenario: [DESKTOP-EDITOR-22] 大文件
- **WHEN** 打开一个 6 MB 的 `data.json`，再打开一个 60 MB 的 `dump.json`
- **THEN** `data.json` 打开、没有高亮和智能提示，并写明原因；`dump.json` 不打开，说明太大并提供“在外部编辑器中打开”
- 验证：test

#### Scenario: [DESKTOP-EDITOR-54] 1 MB 以内有高亮，1 到 5 MB 当纯文本
- **WHEN** 打开一个 800 KB 的 `small.json`，再打开一个 3 MB 的 `mid.json`
- **THEN** `small.json` 有完整的语法高亮；`mid.json` 能正常编辑，但没有语法高亮，并写明“文件较大，不做语法高亮”一类的原因
- 验证：test

### Requirement: 自动保存三档
自动保存 MUST 有三档，默认是第一档：停止输入 1 秒后写入磁盘（1 秒内继续输入 MUST 重新计时）；失去焦点时写入（切到别的文件标签、点预览或其他区域、切到别的应用、关闭窗口时）；关闭（只有 `⌘S` 写入）。`⌘S` 在任何一档 MUST 立即写入。关闭项目标签页和退出应用之前，前两档 MUST 先把未保存的修改写入再继续；“关闭”档有未保存修改时 MUST 先询问“保存”“不保存”“取消”，选“取消”MUST 中止这次关闭或退出、MUST NOT 停止运行。写入 MUST 保留文件原有的换行符（全部是 LF 或全部是 CRLF）和文件末尾是否有换行，文本按 UTF-8 写；文件开头的 BOM（字节序标记）MUST 保留，由应用在写回时补上。换行符不统一（LF 和 CRLF 混用）的文件 MUST 能正常打开，并一次性提示“这个文件的换行符号不统一，保存时会统一成 <多数那种>”，保存时 MUST 统一成占多数的那种（LF 与 CRLF 数量相同时统一成 LF）。写入失败（没有写权限、磁盘已满、文件夹已不存在等）时 MUST 保留编辑器里的内容和未保存标记，说明原因，下次修改或按 `⌘S` 时再试；MUST NOT 丢掉内容。
来源：PRD #prd-run；PRD #prd-settings-items；PRD #prd-editor

#### Scenario: [DESKTOP-EDITOR-23] 默认停止输入 1 秒后保存
- 前提：自动保存是默认设置
- **WHEN** 在 `App.tsx` 里每 0.5 秒输入一个字符，连续 3 秒，然后停下
- **THEN** 输入期间磁盘上的文件没有变化；停下约 1 秒后磁盘上的内容与编辑器一致，状态区显示“已保存”
- 验证：test

#### Scenario: [DESKTOP-EDITOR-24] 失去焦点时保存
- 前提：自动保存设为“失去焦点时”
- **WHEN** 在 `App.tsx` 里输入内容，等 3 秒（磁盘不变），然后点 `main.tsx` 的文件标签
- **THEN** 3 秒内磁盘上的 `App.tsx` 没有变化；切走后写入了刚才的内容
- 验证：test

#### Scenario: [DESKTOP-EDITOR-25] 关闭档只在 `⌘S` 时保存
- 前提：自动保存设为“关闭”
- **WHEN** 输入内容，等 3 秒，切到别的文件标签，再切回按 `⌘S`
- **THEN** 按 `⌘S` 之前磁盘一直不变；按下后写入
- 验证：test

#### Scenario: [DESKTOP-EDITOR-26] `⌘S` 任何一档都立即保存
- 前提：自动保存是“延迟 1 秒后”
- **WHEN** 输入一个字符后马上按 `⌘S`
- **THEN** 不等 1 秒，磁盘上已是新内容
- 验证：test

#### Scenario: [DESKTOP-EDITOR-27] 关闭项目标签页和退出应用前先写入
- 前提：自动保存是“延迟 1 秒后”，`App.tsx` 刚输入了内容、还没到 1 秒
- **WHEN** 关闭项目标签页（或按 `⌘Q`）
- **THEN** 磁盘上的 `App.tsx` 含有刚输入的内容，之后才按 desktop/workspace 的规则确认和停止运行
- 验证：test

#### Scenario: [DESKTOP-EDITOR-28] 关闭档时退出应用先询问
- 前提：自动保存是“关闭”，`App.tsx` 有未保存的修改，标签页持有的运行处于 `ready`
- **WHEN** 按 `⌘Q`，在询问里选“取消”
- **THEN** 应用没有退出，运行仍是 `ready`，修改还在
- 验证：test

#### Scenario: [DESKTOP-EDITOR-29] 保存失败不丢内容
- 前提：`App.tsx` 在磁盘上变成只读
- **WHEN** 修改它并按 `⌘S`
- **THEN** 提示保存失败并写明原因；编辑器里的内容和未保存标记都在；把文件改回可写后再按 `⌘S`，写入成功
- 验证：test

#### Scenario: [DESKTOP-EDITOR-30] 原样保留换行符
- 前提：`legacy.js` 用 CRLF 换行，末尾没有换行
- **WHEN** 改动其中一行并保存
- **THEN** 磁盘上的文件仍全部用 CRLF，末尾仍没有换行，除改动的那一行外字节不变（全部是 LF 的文件同样原样往返）
- 验证：test

#### Scenario: [DESKTOP-EDITOR-55] 换行符不统一时统一成多数那种
- 前提：`mixed.js` 有 10 行，其中 8 行用 LF、2 行用 CRLF
- **WHEN** 打开它，改动其中一行并保存
- **THEN** 打开时正常显示，并一次性提示“这个文件的换行符号不统一，保存时会统一成 LF”（之后再保存不重复提示）；磁盘上的文件全部用 LF
- 验证：test

#### Scenario: [DESKTOP-EDITOR-56] 保留文件开头的 BOM
- 前提：`bom.txt` 以 UTF-8 BOM 开头
- **WHEN** 改动其中一行并保存
- **THEN** 编辑器里看不到 BOM 字符；磁盘上的文件仍以同样的 BOM 开头，除改动的那一行外字节不变
- 验证：test

### Requirement: 文件被外部修改
编辑器 MUST 发现打开的文件在磁盘上被别的程序（智能体、命令行、其他编辑器）修改。编辑器里没有未保存修改时，MUST 直接换成磁盘上的内容，光标 MUST 留在原来的行和列（超出新内容时放在最后）。有未保存修改时，MUST 在文件上方提示磁盘上的文件已被修改，提供“用磁盘上的版本”和“保留我的修改”；提示出现期间这个文件的自动保存 MUST 暂停，MUST NOT 覆盖磁盘上的新内容；选“保留我的修改”才写入。打开的文件在外部被删除时，文件标签 MUST 保留并标明“已删除”，内容还在；按 `⌘S` MUST 重新创建这个文件；自动保存 MUST NOT 自行重新创建它。编辑器自己写入引起的变化 MUST NOT 被当作外部修改。
来源：PRD #prd-editor；PRD #prd-run

#### Scenario: [DESKTOP-EDITOR-31] 没有未保存修改时直接重新加载
- 前提：`App.tsx` 已打开，没有未保存的修改，光标在第 5 行第 3 列
- **WHEN** 命令行改写了 `App.tsx`，新内容有 20 行
- **THEN** 2 秒内编辑器显示新内容，没有询问，光标仍在第 5 行第 3 列
- 验证：test

#### Scenario: [DESKTOP-EDITOR-32] 有未保存修改时提示，不自动覆盖
- 前提：自动保存是“延迟 1 秒后”，`App.tsx` 有刚输入的修改
- **WHEN** 在自动保存之前，命令行改写了 `App.tsx`
- **THEN** 文件上方出现提示，有“用磁盘上的版本”和“保留我的修改”；等 3 秒，磁盘上仍是命令行写的内容，编辑器里仍是我的修改
- 验证：test

#### Scenario: [DESKTOP-EDITOR-33] 选“用磁盘上的版本”
- 前提：上一个场景的提示已出现
- **WHEN** 点“用磁盘上的版本”
- **THEN** 编辑器换成磁盘内容，未保存标记消失，提示消失，之后自动保存照常
- 验证：test

#### Scenario: [DESKTOP-EDITOR-34] 选“保留我的修改”
- 前提：同上
- **WHEN** 点“保留我的修改”
- **THEN** 我的内容写入磁盘，提示消失，状态区显示“已保存”
- 验证：test

#### Scenario: [DESKTOP-EDITOR-35] 文件在外部被删除
- 前提：`src/old.ts` 已打开
- **WHEN** 命令行删除了它；之后在编辑器里改动它并等 3 秒，再按 `⌘S`
- **THEN** 文件标签仍在并标明“已删除”，内容还在；等待期间磁盘上没有这个文件；按 `⌘S` 后文件重新出现，标记消失
- 验证：test

#### Scenario: [DESKTOP-EDITOR-36] 自己保存不算外部修改
- **WHEN** 在编辑器里修改 `App.tsx` 并保存，连续 5 次
- **THEN** 没有出现“磁盘上的文件已被修改”的提示，光标没有跳动
- 验证：test

### Requirement: 语法高亮与主题
模板里用到的每种语言 MUST 有语法高亮，至少包括 TypeScript、JavaScript（含 TSX、JSX）、Vue 单文件组件、CSS、HTML、JSON、Markdown、Python、Go。Vue 单文件组件里的模板、脚本（含 `lang="ts"`）和样式三段 MUST 各按自己的语言着色。编辑器配色 MUST 跟随应用的浅色或深色主题，切换时立即生效，MUST NOT 需要重新打开文件。高亮 MUST NOT 联网。
来源：PRD #prd-editor

#### Scenario: [DESKTOP-EDITOR-37] 每种语言都有高亮
- **WHEN** 依次打开 `.ts`、`.tsx`、`.js`、`.jsx`、`.vue`、`.css`、`.html`、`.json`、`.md`、`.py`、`.go` 文件各一个
- **THEN** 每个文件里的关键字、字符串、注释用不同的颜色显示，不是一种颜色的纯文本
- 验证：test

#### Scenario: [DESKTOP-EDITOR-38] Vue 单文件组件三段分别着色
- 前提：`App.vue` 含 `<template>`、`<script setup lang="ts">`、`<style scoped>`
- **WHEN** 打开 `App.vue`
- **THEN** 模板里的标签和属性、脚本里的 TypeScript 关键字、样式里的属性名都按各自的语言着色
- 验证：test

#### Scenario: [DESKTOP-EDITOR-39] 主题跟随应用
- 前提：编辑器打开着 `App.tsx`，应用是浅色
- **WHEN** 把应用主题换成深色
- **THEN** 编辑器立即换成深色配色，文件标签和光标位置不变
- 验证：test

### Requirement: TypeScript 和 JavaScript 的智能提示
TypeScript、JavaScript（含 TSX、JSX）文件 MUST 有补全、跳转到定义、重命名符号和错误提示，范围是项目自己的文件；另一个项目文件的修改（包括外部修改）MUST 在几秒内反映到提示里。来自依赖包（`node_modules`）的类型第一版没有，因此“找不到模块”一类的错误 MUST 被屏蔽，不显示。智能提示 MUST NOT 联网。Vue 单文件组件只有高亮，MUST NOT 显示补全或错误；Vue 文件里 MUST 关闭基于文字的建议（编辑器默认会从文件里已有的词给建议）。用户手动触发建议时可能弹出一个写着“没有建议”的空窗口，这是已接受的表现，不算缺陷（K8 实测，负责人 2026-10-17 决定）。
来源：PRD #prd-editor

#### Scenario: [DESKTOP-EDITOR-40] 补全项目里的导出
- 前提：`src/math.ts` 导出 `function addTwo(a: number, b: number)`，`App.tsx` 已导入 `./math`
- **WHEN** 在 `App.tsx` 里输入 `addT` 并触发补全
- **THEN** 补全列表里有 `addTwo`，带参数说明
- 验证：test

#### Scenario: [DESKTOP-EDITOR-41] 跳转到另一个文件的定义
- **WHEN** 在 `App.tsx` 里对 `addTwo` 用“跳转到定义”
- **THEN** 打开（或切到）`src/math.ts` 的文件标签，光标在 `addTwo` 的定义处
- 验证：test

#### Scenario: [DESKTOP-EDITOR-42] 类型错误有提示
- **WHEN** 在 `App.tsx` 里写 `const n: number = "a"`
- **THEN** 这一处出现错误波浪线，悬停时显示类型不匹配的说明
- 验证：test

#### Scenario: [DESKTOP-EDITOR-43] 屏蔽找不到模块的误报
- 前提：`App.tsx` 有 `import { useState } from "react"`，依赖已安装或尚未安装
- **WHEN** 打开 `App.tsx`
- **THEN** 没有“找不到模块”一类的错误提示
- 验证：test

#### Scenario: [DESKTOP-EDITOR-44] 别的文件改了，提示跟着变
- 前提：`App.tsx` 调用了 `addTwo(1, 2)`，没有错误
- **WHEN** 命令行把 `src/math.ts` 里的 `addTwo` 改名为 `sum`
- **THEN** 几秒内 `App.tsx` 里的 `addTwo` 出现错误提示
- 验证：test

#### Scenario: [DESKTOP-EDITOR-45] 不联网
- 前提：应用的网络请求被记录
- **WHEN** 打开 `.ts`、`.tsx`、`.vue` 文件，触发补全、跳转和高亮
- **THEN** 没有任何发往本机以外地址的请求
- 验证：test

#### Scenario: [DESKTOP-EDITOR-46] Vue 文件没有误报
- 前提：`App.vue` 导入了 `vue` 和项目里的组件
- **WHEN** 打开 `App.vue`
- **THEN** 有高亮，没有错误波浪线，输入时也没有补全弹出（基于文字的建议已关闭）
- 说明：手动触发建议时允许出现空的“没有建议”窗口，不算缺陷
- 验证：test

### Requirement: 编辑后的实时结果
编辑器保存后的实时效果 MUST 与别的程序写同一个文件完全相同，由磁盘上的变化驱动，按项目类型：静态页面 MUST 自动刷新预览；前端开发服务器 MUST 由框架的热更新更新预览，运行 MUST 保持 `ready`；单文件脚本 MUST 按 run/scripts 的规则重新运行（有语法错误时不运行并标为“过期”）；服务 MUST 按 templates/runners 的规则重启。自动保存是“关闭”时，只有写入磁盘后才触发这些效果。
来源：PRD #prd-run；PRD #prd-script-projects

#### Scenario: [DESKTOP-EDITOR-47] 静态页面保存后预览自动刷新
- 前提：`html` 模板的项目处于 `ready`，预览显示 `<h1>Hello</h1>`
- **WHEN** 在编辑器里把 `index.html` 的 `Hello` 改成 `Hi` 并保存
- **THEN** 2 秒内预览显示 `Hi`，没有手动刷新
- 验证：test

#### Scenario: [DESKTOP-EDITOR-48] 前端开发服务器热更新
- 前提：`react19` 项目处于 `ready`，预览里计数器显示 3
- **WHEN** 在编辑器里修改 `src/App.tsx` 里的标题文字并保存
- **THEN** 预览里的标题更新，运行一直是 `ready`，进程号不变
- 验证：test

#### Scenario: [DESKTOP-EDITOR-49] 脚本保存后重新运行
- 前提：`python` 项目，“保存后自动运行”开着，上一次运行已结束
- **WHEN** 在编辑器里修改 `main.py` 的输出内容并保存
- **THEN** 输出面板出现新的一次运行和新的输出
- 验证：test

#### Scenario: [DESKTOP-EDITOR-50] 服务保存后重启
- 前提：`hono` 项目处于 `ready`
- **WHEN** 在编辑器里修改一个路由的返回内容并保存
- **THEN** 状态经过 `reloading` 回到 `ready`，端口不变
- 验证：test

#### Scenario: [DESKTOP-EDITOR-51] 编辑器保存与外部写入效果一致
- 前提：`html` 项目处于 `ready`，`index.html` 在编辑器里开着
- **WHEN** 命令行把 `index.html` 改写成新的内容
- **THEN** 预览和编辑器都在 2 秒内显示新内容，与在编辑器里保存同样内容的效果相同
- 验证：test

### Requirement: 查找替换与多光标
编辑器 MUST 提供当前文件里的查找和替换（`⌘F`、`⌥⌘F`，支持区分大小写、全词、正则）和多光标（`⌥` 加点击、`⌘D` 选下一个相同内容），快捷键与 VS Code 相同，并 MUST 能只用键盘完成。
来源：PRD #prd-editor

#### Scenario: [DESKTOP-EDITOR-52] 查找和替换
- 前提：`App.tsx` 里有 3 处 `count`
- **WHEN** 按 `⌥⌘F`，查找 `count`、替换为 `total`，选“全部替换”
- **THEN** 3 处都换成 `total`，文件标签带未保存标记（或按自动保存的设置写入）
- 验证：test

#### Scenario: [DESKTOP-EDITOR-53] 多光标
- 前提：`App.tsx` 里有 3 处 `count`
- **WHEN** 选中第一处 `count`，按两次 `⌘D`，输入 `total`
- **THEN** 3 处同时变成 `total`
- 验证：test
