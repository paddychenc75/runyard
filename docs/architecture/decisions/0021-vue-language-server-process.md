# 0021. Vue 智能提示用官方语言服务器，每个项目一组独立进程

状态：提议中

日期：2026-10-18

来源：PRD #prd-editor；技术设计 §6.2、§6.5；负责人 2026-10-18 决定 Vue 智能提示第一版做完整的（[证据](../evidence/vue-intellisense.md)的选项 3）

## 背景

负责人要 `.vue` 文件有完整的智能提示：模板里组件属性名、事件名的补全，悬停、跳转、报错，并读项目里真实的类型（`node_modules/vue`、`tsconfig.json`），还问能否装官方的 Vue VS Code 扩展。Monaco 没有扩展宿主，扩展装不了。上一次验证把 Vue 语言服务放进界面的后台线程：属性名补全做不出来（线程里没有 tsserver），也没解决读项目真实类型。这次按官方扩展本身的结构验证了另一条路，数据见证据文件“第二次验证”一节。

## 决定

用官方扩展（Vue - Official）背后的同一套语言服务，跑成独立进程：

1. 每个打开了 `.vue` 文件的项目起两个进程：`@vue/language-server`（Vue 语言服务器）和带 `@vue/typescript-plugin` 的 tsserver（“混合模式”，官方扩展就是这样）。两者都直接从磁盘读这个项目的文件、`tsconfig.json` 和 `node_modules`。
2. 进程由主进程启动，用应用自带的 Electron 当 Node（`ELECTRON_RUN_AS_NODE`，与管理进程相同），不用 `utilityProcess`：实测 `utilityProcess` 不认 Node 的权限参数。启动参数固定为 `--permission`，只给两处读权限：这个项目的文件夹、应用自带的语言服务目录；不给写、不给启动子进程、不给后台线程。启动前先加载一个随应用带的守卫脚本，堵住联网的入口（Node 24 的权限模型不管网络），并把对项目外路径的文件监听变成空操作。
3. 主进程在两个进程之间转发 Vue 服务器发给 tsserver 的请求（`tsserver/request`、`tsserver/response`），并经预加载脚本给界面一个窄接口：文档同步、补全、悬停、跳转、报错。界面这边手写 Monaco 与 LSP、tsserver 协议的转换，只接这几项，不用 `monaco-languageclient`。
4. 随应用带的版本：`@vue/language-server` 3.3.12（esbuild 打成一个文件）、`@vue/typescript-plugin` 3.3.12（连同依赖原样带上，打包后脚本侧功能失效，见证据）、TypeScript 6.0.3 的 tsserver。用户项目自己的 TypeScript 不用。
5. 什么时候起、什么时候停：项目里第一个 `.vue` 文件打开时启动；项目标签页关闭、项目改名或移到废纸篓前停止；同时最多两个项目有语言服务，第三个打开时停掉最久没用的；进程崩溃后自动重启，连续 3 次失败就不再启动，Vue 文件退回只有着色。

## 后果

- 界面的内容安全策略不变（0020）：界面不联网，语言服务不在界面里。
- 安装包多约 23 MB（压缩后约 4 MB）；每个有语言服务的项目多约 430 至 545 MB 内存（tsserver 约 300 至 400 MB，Vue 服务器约 140 MB），所以要有上面第 5 条的上限。
- `.vue` 文件的补全、悬停、跳转、报错由这组进程提供；`.ts`、`.tsx` 文件仍用 Monaco 自带的 TS 后台线程，“找不到模块”照旧屏蔽。同一个项目里 `.vue` 能看到依赖的类型而 `.ts` 看不到，这个不一致留给以后（PRD 的 P1“来自 `node_modules` 的类型”）。
- 依赖按 `docs/guides/add-a-dependency.md` 在实现 issue 里装，记进 `dependencies.md`；Vue 语言工具每月一到两个版本，升级时重跑证据里的验证脚本。
- 新代码放在桌面应用里：启动进程的部分在主进程的 `integration` 目录，守卫脚本是单独的构建入口；不新建包，不改 `layers.json`。
- 规格 desktop/editor 新增“Vue 单文件组件的智能提示”一条要求（DESKTOP-EDITOR-79 至 92），场景 46 改写。

## 被否的方案

- 装 VS Code 扩展：Monaco 没有扩展宿主；要装就得换成 VS Code 工作台，违反 PRD“使用纯 Monaco”。
- Vue 语言服务放进界面的后台线程（上一次验证）：属性名补全做不出来，读真实类型要自己搭虚拟文件系统和进程间通信。
- `utilityProcess`：能跑通，但权限参数被忽略，进程能读整个磁盘。
- `monaco-languageclient` 11：要换成 VS Code 的服务层（`@codingame/monaco-vscode-api`），与现在的 Monaco 0.57 装法冲突；11 是不满 90 天的大版本。
- 只做脚本块（证据里的方案 B）：负责人要模板里的补全。
