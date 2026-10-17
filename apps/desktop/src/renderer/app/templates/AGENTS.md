# 模板页与另存为模板弹窗

## 用途

规格 desktop/templates-view，设计稿 Templates、SaveTemplate（#291、#292）。

## 对外暴露什么

不是库。界面入口是 `TemplatesPage`（侧栏“模板”）和 `SaveTemplateDialog`（行和工作区“更多”菜单的“另存为模板…”）；主进程暴露 `template.list|detail|reveal|savePlan|save` 五个桥方法（白名单在 `src/shared/templates-view.ts`）。

## 本包特有的规则

模板页和另存为模板弹窗（#291、#292，规格 desktop/templates-view，设计稿 Templates、SaveTemplate）在 `renderer/app/templates/`，主进程一侧是 `main/templates-view.ts`（`TemplatesView`，`index.ts` 里接线，经 `template-ipc.ts` 暴露 `template.list|detail|reveal|savePlan|save` 五个桥方法）。侧栏“模板”（右边是 `LibraryState.templateCount`，内置加用户的、无效的也算）切到模板页，页面和设置页一样没有顶栏（`ShellPage`）；每次打开页面都重读 `template.list`（手写的模板不用重启）。详情只用已有的检测结果：`toolchain.check { template, cachedOnly: true }`，管理进程只读缓存、不起进程，没检测过的工具版本和状态留空；运行方式来自 `template.get` 的 `runner` 摘要（安装命令按本机检测到的包管理器挑，命令只展示不执行）；无效的用户模板列出并写 `problems` 里第一条规则对应的原因，“用它新建”灰着；“在访达中显示”只发请求。选择器（`library.templates`）现在也含有效的用户模板，归在“我的”。另存弹窗的文件树由 `save-template-plan.ts` 列出（默认不包含的规则是协议包的 `templateDefaultExclusion`，管理进程另存时用同一份），“把项目名替换成变量”默认开，保存走 `template.save`，成功后主进程重读状态，选择器立即有它；入口是行和工作区“更多”菜单共用的 `use-playground-edits.tsx`（命令面板的同名命令也走它）。弹窗用 `Dialog` 的 `wide` 版（底栏钉住）和 `Checkbox` 的 `labelHidden`。

## 子目录地图

- `templates-model.ts`、`save-template-model.ts`、`path-tree.ts`：不碰 DOM 的纯判断（分组、版本范围写法、标识校验、勾选转保存请求、路径树）。
- `template-labels.ts`：文案键必须是完整字面量，值对应文案的映射写在这里。
- `use-templates.ts`：模板页的数据（列表和选中项的详情）。

## 测试

`templates-page.test.tsx`、`save-template.test.tsx` 用 `templates-world.tsx` 的假主进程；主进程一侧的 `main/templates-view.test.ts`、`main/save-template-plan.test.ts`。
