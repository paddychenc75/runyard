# 画面级验收工作台（#400）

## 用途

仅测试入口，生产build/pack不引用。复用真实AppShell、页面和弹窗，不复制产品DOM；`scene-state`与`bridge-data`提供主进程契约替身，未知桥方法必须失败。工作台只访问自己的回环服务，既不启动管理进程也不运行模板服务器。原生预览、真实文件、工具链和进程行为仍由打包E2E证明；这里的Web画面只覆盖renderer外壳和预览槽，不能声称测过原生网页。

编辑器脚本、样式、中文包和字体由既有`buildEditor`真实构建。测试路由只把已构建文件白名单中的`app://runyard/editor/*`与`workers/*`映射到临时回环站点；拒绝点目录、编码路径、主机/协议变化及未登记资源，不提供空脚本或生产联网豁免。工作台未打开文件，不能把运行时加载验收当成Monaco文件、worker或语言服务的完整验收。

## 对外暴露什么

只有测试命令与CI产物，不向应用或其他产品包提供运行时入口。

## 本包特有的规则

`scenes.ts`登记canvas中01–33（32长期未使用按PRD延期）及#400正文点名的WorkspaceRename、AutoCleanDialog、UpdateBanner。独立设置使用SettingsWindow；AgentActivity/CleanReminder/Update按已批准的通知来源迁移呈现通知卡片，新增Notify三卡和NotifyCenter分组列表。不会恢复已被替代的旧横幅或页面。设计源文件只读，现有measure并排图继续作为设计评审证据。

`ui-fixtures`核对有效画板登记，`screens.spec.ts`逐场景执行五种语言主题组合，成功扫描和基准比对后才附覆盖附件；`check-results.ts`核对执行结果，跳过/失败/只登记都不能算覆盖。伪语言仍用已有的漏文案与溢出扫描器，不降低阈值、不整页豁免。技术/用户内容只通过明确UserText边界；刻意截断只标记具体元素，隐藏读屏文案仍参加文字检查。

## 子目录地图

- `main.tsx`、`scene-state.ts`、`bridge-data.ts`、`bridge.ts`：真实页面装配与契约替身。
- `scenes.ts`、`prepare-scene.ts`：画板映射、正常UI交互及可见性断言。
- `screens.spec.ts`、`audit.spec.ts`：全矩阵回归与故障注入。
- `executed-coverage.ts`、`check-results.ts`、`check-budget.ts`：执行覆盖和既有预算检查。
- `build.ts`、`probe.ts`：回环构建服务、本机诊断扫描；`resource-policy.ts`、`resource-route.ts`是诊断和CI共用的资源白名单与网络闸门。

## 测试

- `pnpm --filter @runyard/desktop visual:scan`：锁定的Playwright Chromium无头跑en-XA，与CI用同一个浏览器和资源闸门；先运行已有`pnpm --filter @runyard/ui visual:install`。截图与JSON保留在输出所示临时目录；可在命令后给单一场景名定位，不是CI全覆盖入口。
- `pnpm --filter @runyard/desktop visual:screens`：Playwright全矩阵截图比对、伪语言及运行覆盖检查。先用现有`pnpm --filter @runyard/ui visual:install`安装锁定的Chromium。
- `__screenshots__`只由独立macOS CI生成；PR加`update-screen-baseline`，不用本地`-u`。`desktop-baseline.yml`与组件基准的`update-ui-baseline`相互独立，不操作组件PNG。
- 保持既有单张200KB、组件与画面合计30MB、像素容差20；不把目录隔离当成增加预算。
- `probe.ts`是定位工具，不写基准。`audit.spec.ts`故意注入裸文案和溢出来证明扫描会失败，故障DOM从不进入基准。

新增场景必须有真实状态/交互与独特可见性断言；不要只把另一个画面的名字登记过去。涉及生产页面修复按已有规格补回归；不要为测试向生产AppShell或locale接口加入口。
