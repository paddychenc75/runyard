# 文案一览

<!-- 由 pnpm generate 生成，不要手改。来源：packages/i18n/locales/ -->

一行一个键：中文是源语言，英文在同一个 PR 里补齐。改文案去 `packages/i18n/locales/`，再运行 `pnpm generate`。

| 键 | 中文 | 英文 | 备注 |
| --- | --- | --- | --- |
| cli.arg.key.hint | 设置项的名字，目前只有 lang | Name of the setting; the only one is lang | — |
| cli.arg.name.hint | 项目名称，不写则按模板标识加序号命名 | Playground name; if omitted, the template id plus a number is used | — |
| cli.arg.pg.hint | 项目名称或路径 | Playground name or path | — |
| cli.arg.pgOptional.hint | 项目名称或路径，不写则列出全部 | Playground name or path; if omitted, all are listed | — |
| cli.arg.template.hint | 模板标识 | Template id | — |
| cli.arg.templateRef.hint | 模板标识或模板文件夹 | Template id or template folder | — |
| cli.arg.value.hint | 新的值 | The new value | — |
| cli.command.config.title | 查看和修改命令行的设置 | Show and change command line settings | — |
| cli.command.configGet.title | 显示设置的当前值和来源 | Show the current value of a setting and where it comes from | — |
| cli.command.configSet.title | 修改设置 | Change a setting | — |
| cli.command.doctor.title | 检查运行环境并输出诊断信息 | Check the environment and print diagnostics | — |
| cli.command.logs.title | 读取项目的日志 | Read the log of a playground | — |
| cli.command.new.title | 用模板新建项目，可以接着运行 | Create a playground from a template, optionally run it | — |
| cli.command.rm.title | 停止项目并移到{term_trash} | Stop a playground and move it to the {term_trash} | — |
| cli.command.run.title | 运行项目，等到就绪或退出 | Run a playground and wait until it is ready or exits | — |
| cli.command.skill.title | 安装给智能体用的说明 | Install the instructions for agents | — |
| cli.command.skillInstall.title | 把说明写到智能体的目录 | Write the instructions to the agent folders | — |
| cli.command.status.title | 列出项目和运行状态 | List playgrounds and their run state | — |
| cli.command.stop.title | 停止项目的运行 | Stop the run of a playground | — |
| cli.command.template.title | 查看、保存、检查和测试模板 | Show, save, lint and test templates | — |
| cli.command.templateLint.title | 检查模板的格式 | Check the format of a template | — |
| cli.command.templateList.title | 列出模板 | List templates | — |
| cli.command.templateSave.title | 把项目存为模板 | Save a playground as a template | — |
| cli.command.templateShow.title | 查看一个模板 | Show one template | — |
| cli.command.templateTest.title | 对模板做冒烟测试 | Smoke-test a template | — |
| cli.command.version.title | 输出版本号 | Print the version number | — |
| cli.config.getLang.body | {lang}（来源：{source, select, flag {--lang} env {RUNYARD_LANG} saved {已保存的设置} other {默认值}}） | {lang} (source: {source, select, flag {--lang} env {RUNYARD_LANG} saved {saved setting} other {default}}) | lang：生效的语言，en 或 zh-CN，原样显示；source：来源：flag、env、saved 或 default；用 select 选词 |
| cli.config.setLang.body | 语言已设为 {lang}。 | Language set to {lang}. | lang：写入的语言，en 或 zh-CN，原样显示 |
| cli.doctor.bundle.body | 诊断包已导出：{path} | Diagnostics bundle exported: {path} | path：诊断包的绝对路径，原样显示 |
| cli.doctor.cli.body | 命令行：版本 {version}，{kind, select, app {随应用安装} other {从源码运行}}，位置 {path} | Command line: version {version}, {kind, select, app {installed with the app} other {run from source}}, at {path} | version：命令行版本，原样显示；kind：app 或 source；用 select 选词；path：命令行位置，原样显示 |
| cli.doctor.installCommand.body | 安装方法（只是提示，不会自动执行）：{command} | How to install (a hint only, nothing is run for you): {command} | command：安装命令，原样显示 |
| cli.doctor.installUrl.body | 官网：{url} | Website: {url} | url：官网链接，原样显示 |
| cli.doctor.library.body | 资源库：{root} | Library: {root} | root：资源库文件夹的绝对路径，原样显示 |
| cli.doctor.other.body | PATH 上还有另一份：{kind, select, app {随应用安装} other {从源码运行}}，版本 {version}，位置 {path} | Another copy is on PATH: {kind, select, app {installed with the app} other {run from source}}, version {version}, at {path} | kind：app 或 source；用 select 选词；version：版本，认不出时是问号；path：位置，原样显示 |
| cli.doctor.supervisorDown.body | 管理进程：不可用（{reason}）{startFailure, select, PATH_TOO_LONG {。启动失败：连接文件路径超过系统允许的长度，请换更短的主目录或 --root} STARTUP_FAILED {。启动失败，详细原因在状态目录的 logs/supervisor.log} none {} other {}} | Background process: not available ({reason}){startFailure, select, PATH_TOO_LONG {. It failed to start: the connection file path is longer than the system allows; use a shorter home folder or --root} STARTUP_FAILED {. It failed to start; details are in logs/supervisor.log in the state folder} none {} other {}} | reason：错误码，原样显示；startFailure：管理进程启动失败的原因：PATH_TOO_LONG（连接文件路径超过系统上限）或 STARTUP_FAILED；不知道原因时不显示这一段 |
| cli.doctor.supervisorRunning.body | 管理进程：运行中，版本 {version}，{runs, plural, other {# 个运行}}，由{startedBy, select, app {应用} other {命令行}}启动 | Background process: running, version {version}, {runs, plural, one {# run} other {# runs}}, started by the {startedBy, select, app {app} other {command line}} | version：管理进程版本，原样显示；runs：运行个数；startedBy：app 或 cli；用 select 选词 |
| cli.doctor.system.body | 系统：{os} {version}（{arch}） | System: {os} {version} ({arch}) | os：系统标识，原样显示；version：系统版本，原样显示；arch：芯片架构，原样显示 |
| cli.doctor.toolFound.body | {tool}：{version}（{path}） | {tool}: {version} ({path}) | tool：工具名，原样显示；version：版本号，原样显示；path：可执行文件路径，原样显示 |
| cli.doctor.toolMissing.body | {tool}：没有找到 | {tool}: not found | tool：工具名，原样显示 |
| cli.doctor.toolTooOld.body | {tool}：{version} 版本过低，需要 {required} | {tool}: {version} is too old, needs {required} | tool：工具名，原样显示；version：已安装的版本号，原样显示；required：要求的版本范围，原样显示 |
| cli.doctor.toolUnknown.body | {tool}：还不知道 | {tool}: not known yet | tool：工具名，原样显示 |
| cli.error.title.label | 错误：{title} | Error: {title} | title：错误的标题，来自错误码的文案，原样显示 |
| cli.help.arguments.label | 参数： | Arguments: | — |
| cli.help.commands.label | 命令： | Commands: | — |
| cli.help.globalOptions.label | 全局选项： | Global options: | — |
| cli.help.moreInfo.hint | 运行 {example} 查看某个命令的说明。 | Run {example} for details of one command. | example：示例命令，原样显示，如 runyard <command> --help |
| cli.help.options.label | 选项： | Options: | — |
| cli.help.summary.title | 用本地模板新建、运行和管理项目，每个项目是一个小的代码示例。 | Create, run and manage playgrounds, which are small code examples, from local templates. | — |
| cli.help.usage.label | 用法： | Usage: | — |
| cli.lang.unsupported.hint | 不支持的语言 {value}（{source, select, flag {来自 --lang} env {来自 RUNYARD_LANG} other {来自已保存的设置}}），改用英文。支持的值：en、zh-CN。 | Unsupported language {value} (from {source, select, flag {--lang} env {RUNYARD_LANG} other {the saved setting}}), using English. Supported values: en, zh-CN. | value：用户给的语言值，原样显示；source：值来自哪里：flag、env 或 saved；用 select 选词 |
| cli.new.created.body | 已创建项目 {name}：{path} | Created playground {name}: {path} | name：项目名称，原样显示；path：项目文件夹的绝对路径，原样显示 |
| cli.new.reused.body | 使用已有的项目 {name}：{path} | Using the existing playground {name}: {path} | name：项目名称，原样显示；path：项目文件夹的绝对路径，原样显示 |
| cli.option.all.hint | 停止全部运行 | Stop all runs | — |
| cli.option.as.hint | 新模板的标识，只用小写字母、数字和连字符 | Id of the new template: lowercase letters, digits and hyphens | — |
| cli.option.bundle.hint | 导出诊断包并打印路径 | Export a diagnostics bundle and print its path | — |
| cli.option.cleanAfter.hint | 指定天数后自动清理，如 30d | Clean up automatically after this many days, such as 30d | — |
| cli.option.description.hint | 新模板的说明，不写则为空 | Description of the new template; empty by default | — |
| cli.option.exclude.hint | 从模板里去掉默认会收录的文件，可重复 | Leave out a file that is included by default; repeatable | — |
| cli.option.follow.hint | 持续输出新内容直到运行结束 | Keep printing new output until the run ends | — |
| cli.option.help.hint | 显示说明 | Show help | — |
| cli.option.ifExists.hint | 名称已存在时的做法，reuse 或 fail | What to do if the name exists: reuse or fail | — |
| cli.option.include.hint | 把默认不收录的文件加进模板，可重复 | Add a file that is left out by default; repeatable | — |
| cli.option.json.hint | 输出一个 JSON 对象，不受语言影响 | Print one JSON object; not affected by language | — |
| cli.option.keepDir.hint | 测试后保留临时文件夹 | Keep the temporary folder after the test | — |
| cli.option.lang.hint | 只对这一条命令使用的语言，en 或 zh-CN | Language for this command only: en or zh-CN | — |
| cli.option.mine.hint | 只停命令行持有的运行 | Stop only the runs held by the command line | — |
| cli.option.noWait.hint | 请求被接受后立即返回 | Return as soon as the request is accepted | — |
| cli.option.note.hint | 项目的备注 | A note for the playground | — |
| cli.option.port.hint | 只用于这一次的端口 | Port to use for this run only | — |
| cli.option.quiet.hint | 不输出进度和提示，结果和错误照常输出 | Do not print progress or notices; results and errors are still printed | — |
| cli.option.raw.hint | 保留颜色码等控制序列 | Keep control sequences such as color codes | — |
| cli.option.replaceName.hint | 把文件里的项目名换成 '{{name}}' 变量 | Replace the playground name in files with the '{{name}}' variable | — |
| cli.option.restart.hint | 已在运行时先重启 | Restart first if it is already running | — |
| cli.option.root.hint | 用这个目录代替主目录 | Use this folder in place of the home folder | — |
| cli.option.run.hint | 创建后立即运行 | Run it right after creating | — |
| cli.option.running.hint | 只列出运行中的项目 | List only playgrounds that are running | — |
| cli.option.since.hint | 只读这个游标之后的内容 | Read only what comes after this cursor | — |
| cli.option.tail.hint | 只读最后几行 | Read only the last lines | — |
| cli.option.target.hint | 写到哪里：claude、agents 或 all | Where to write: claude, agents or all | — |
| cli.option.template.hint | 只检查这个模板所需的环境 | Check only what this template needs | — |
| cli.option.templateName.hint | 新模板的名称，不写则用标识 | Name of the new template; defaults to the id | — |
| cli.option.timeout.hint | 最多等待的秒数 | Longest time to wait, in seconds | — |
| cli.option.toolVersion.hint | 用指定的工具版本测试 | Test with the given tool version | — |
| cli.option.var.hint | 替换模板里的变量，可以重复 | Replace a variable in the template; can be repeated | — |
| cli.option.version.hint | 输出版本号 | Print the version number | — |
| cli.rm.trashed.body | 已把 {name} 移到{term_trash}：{path} | Moved {name} to the {term_trash}: {path} | name：项目名称，原样显示；path：项目原来所在文件夹的绝对路径，原样显示 |
| cli.run.alreadyRunning.body | {name} 已经在运行。 | {name} was already running. | name：项目名称，原样显示 |
| cli.run.finished.body | {name} 已运行结束，退出码 {exitCode}。 | {name} finished with exit code {exitCode}. | name：项目名称，原样显示；exitCode：脚本的退出码（整数） |
| cli.run.ready.body | {name} 已就绪：{url} | {name} is ready at {url} | name：项目名称，原样显示；url：服务的地址，以 http://127.0.0.1: 开头，原样显示 |
| cli.run.started.body | 已启动 {name}（运行 {runId}）。 | Started {name} (run {runId}). | name：项目名称，原样显示；runId：运行的标识，原样显示 |
| cli.run.starting.body | 正在启动 {name} | Starting {name} | name：项目名称，原样显示 |
| cli.skillInstall.installed.body | 已写入 {target, select, claude {Claude} other {智能体}} 的说明：{path} | Wrote the {target, select, claude {Claude} other {agents}} instructions: {path} | target：claude 或 agents；用 select 选词；path：写入的 SKILL.md 绝对路径，原样显示 |
| cli.status.empty.body | 没有项目。 | No playgrounds. | — |
| cli.status.item.body | {name}　{state}{url, select, none {} other {　{url}}}{missing, select, yes {　（找不到文件夹）} other {}} | {name}  {state}{url, select, none {} other {  {url}}}{missing, select, yes {  (folder missing)} other {}} | name：项目名称，原样显示；state：运行状态（已按当前语言挑选的文字）；url：地址，原样显示；没有时是 none；missing：yes 或 no；yes 时加“找不到文件夹”标记 |
| cli.status.summary.body | {count, plural, other {# 个项目运行中}} | {count, plural, one {# playground running} other {# playgrounds running}} | count：运行中的个数 |
| cli.stop.none.body | 没有可停止的运行。 | No runs to stop. | — |
| cli.stop.stopped.body | 已停止 {name}（运行 {runId}） | Stopped {name} (run {runId}) | name：项目名称，原样显示；runId：运行 id，原样显示 |
| cli.templateLint.failed.body | 模板 {template} 没有通过检查： | Template {template} did not pass: | template：模板标识，原样显示 |
| cli.templateLint.issue.body | {rule}　{path}　{message} | {rule}  {path}  {message} | rule：检查规则名，原样显示；path：出问题的字段或文件，原样显示；message：英文说明，原样显示 |
| cli.templateLint.ok.body | 模板 {template} 通过检查。 | Template {template} passed. | template：模板标识，原样显示 |
| cli.templateList.item.body | {id}　{name}　{source, select, builtin {内置} other {我的}}{valid, select, yes {} other {　（无效）}} | {id}  {name}  {source, select, builtin {built-in} other {mine}}{valid, select, yes {} other {  (invalid)}} | id：模板标识，原样显示；name：模板名称（已按当前语言挑选），原样显示；source：builtin 或 user；用 select 选词；valid：yes 或 no；no 时加“无效”标记 |
| cli.templateSave.saved.body | 已存为模板 {id}：{path} | Saved as template {id}: {path} | id：新模板的标识，原样显示；path：新模板文件夹的绝对路径，原样显示 |
| cli.templateShow.file.body | {file} | {file} | file：模板里文件的相对路径，原样显示 |
| cli.templateShow.path.body | 位置：{path} | Location: {path} | path：模板文件夹的绝对路径，原样显示 |
| cli.templateTest.step.body | {step}：{status, select, ok {通过} other {失败}}（{ms} ms） | {step}: {status, select, ok {passed} other {failed}} ({ms} ms) | step：步骤标识，固定英文；status：ok 或 failed；ms：步骤耗时毫秒 |
| cli.usage.invalidValue.body | {option} 的值 {value} 不合法。 | The value {value} is not valid for {option}. | option：选项或设置名；value：用户输入的值，原样显示 |
| cli.usage.missingArgument.body | 缺少参数：{argument}。 | Missing argument: {argument}. | argument：缺少的参数名，如 <pg> |
| cli.usage.missingCommand.body | 没有给出命令。 | No command was given. | — |
| cli.usage.optionNeedsValue.body | 选项 {option} 需要一个值。 | Option {option} needs a value. | option：选项名，如 --timeout |
| cli.usage.optionTakesNoValue.body | 选项 {option} 不接受值。 | Option {option} does not take a value. | option：选项名，如 --json |
| cli.usage.stopTarget.body | 要么给出项目，要么用 --all，二者只能有一个；--mine 只能和 --all 一起用。 | Give a playground or --all, not both or neither; --mine only goes with --all. | — |
| cli.usage.tooManyArguments.body | 多出来的参数：{argument}。 | Unexpected argument: {argument}. | argument：多出来的参数，原样显示 |
| cli.usage.unknownCommand.body | 不认识的命令：{command}。 | Unknown command: {command}. | command：用户输入的命令，原样显示 |
| cli.usage.unknownOption.body | 不认识的选项：{option}。 | Unknown option: {option}. | option：用户输入的选项，原样显示 |
| cli.usage.unknownSetting.body | 不认识的设置项：{name}。目前只有 lang。 | Unknown setting: {name}. The only setting is lang. | name：用户输入的设置项，原样显示 |
| cli.version.body | {version} | {version} | version：应用的版本号，如 0.2.0；输出里只有它 |
| desktop.agentNotice.meta.label | {url} · {time} | {url} · {time} | url：运行的地址，如 http://127.0.0.1:7113/；还没有端口时不显示这一条；time：相对时间，如“刚刚” |
| desktop.agentNotice.title.label | <user>{agent}</user> 创建并运行了 <user>{name}</user> | <user>{agent}</user> created and ran <user>{name}</user> | agent：智能体名称（用户或命令行给的，不翻译）；name：项目名称（不翻译）；user：包住用户内容的标签 |
| desktop.agentNotice.unnamed.label | 智能体创建并运行了 <user>{name}</user> | An agent created and ran <user>{name}</user> | name：项目名称（不翻译）；user：包住用户内容的标签 |
| desktop.category.frontend.label | 前端 | Front end | — |
| desktop.category.fullstack.label | 全栈 | Full stack | — |
| desktop.category.mine.label | 我的 | Mine | — |
| desktop.category.page.label | 页面 | Pages | — |
| desktop.category.script.label | 脚本 | Scripts | — |
| desktop.category.service.label | 服务 | Services | — |
| desktop.command.autoClean.label | 自动清理… | Auto-clean… | — |
| desktop.command.closeProjectTab.label | 关闭标签页 | Close tab | — |
| desktop.command.closeTab.label | 关闭文件标签 | Close file tab | — |
| desktop.command.copyLink.label | 复制链接 | Copy link | — |
| desktop.command.copyPath.label | 复制路径 | Copy path | — |
| desktop.command.devtools.label | 打开开发者工具 | Open developer tools | — |
| desktop.command.duplicate.label | 创建副本 | Duplicate | — |
| desktop.command.editNote.label | 编辑备注… | Edit note… | — |
| desktop.command.find.label | 查找 | Find | — |
| desktop.command.foldAll.label | 折叠全部 | Fold all | — |
| desktop.command.goToDefinition.label | 跳到定义 | Go to definition | — |
| desktop.command.goToLine.label | 跳到行… | Go to line… | — |
| desktop.command.new.label | 新建项目… | New playground… | — |
| desktop.command.openInBrowser.label | 在浏览器中打开 | Open in browser | — |
| desktop.command.openInEditor.label | 在外部编辑器中打开 | Open in external editor | — |
| desktop.command.openLibrary.label | 打开资源库 | Open library | — |
| desktop.command.openRunning.label | 打开运行视图 | Open running view | — |
| desktop.command.openTerminal.label | 在终端中打开 | Open in Terminal | — |
| desktop.command.quickOpen.label | 快速打开文件 | Quick open file | — |
| desktop.command.reloadPreview.label | 刷新预览 | Reload preview | — |
| desktop.command.rename.label | 重命名… | Rename… | — |
| desktop.command.renameSymbol.label | 重命名符号 | Rename symbol | — |
| desktop.command.replace.label | 替换 | Replace | — |
| desktop.command.restart.label | 重启 | Restart | — |
| desktop.command.reveal.label | 在{term_fileManager}中显示 | Show in {term_fileManager} | — |
| desktop.command.run.label | 运行 | Run | — |
| desktop.command.save.label | 保存 | Save | — |
| desktop.command.saveAsTemplate.label | 另存为模板… | Save as template… | — |
| desktop.command.selectAllOccurrences.label | 选中所有相同内容 | Select all occurrences | — |
| desktop.command.settings.label | 设置 | Settings | — |
| desktop.command.showOutput.label | 显示输出 | Show output | — |
| desktop.command.showTerminal.label | 显示终端 | Show terminal | — |
| desktop.command.stop.label | 停止运行 | Stop | — |
| desktop.command.stopAll.label | 全部停止 | Stop all | — |
| desktop.command.themeDark.label | 主题：深色 | Theme: dark | — |
| desktop.command.themeLight.label | 主题：浅色 | Theme: light | — |
| desktop.command.themeSystem.label | 主题：跟随系统 | Theme: match system | — |
| desktop.command.toggleComment.label | 切换行注释 | Toggle line comment | — |
| desktop.command.toggleTree.label | 收起或展开文件树 | Collapse or expand file tree | — |
| desktop.command.trash.label | 移到{term_trash} | Move to {term_trash} | — |
| desktop.command.unfoldAll.label | 展开全部 | Unfold all | — |
| desktop.console.clear.action | 清除 | Clear | — |
| desktop.console.tab.label | 输出 | Output | — |
| desktop.console.tabs.aria | 底部面板 | Bottom panel | — |
| desktop.console.terminal.label | 终端 | Terminal | — |
| desktop.crashed.log.label | 最后的日志 | Last output | — |
| desktop.crashed.overlay.aria | 崩溃提示 | Crash notice | — |
| desktop.crashed.title | 已崩溃 · 退出码 {exitCode} | Crashed · exit code {exitCode} | exitCode：进程的退出码 |
| desktop.create.autoClean.label | 自动清理 | Auto-clean | — |
| desktop.create.autoCleanOff.hint | 打开后，很久没打开会自动移到{term_trash} | When on, it moves to the {term_trash} after going unused | — |
| desktop.create.autoCleanOff.label | 可选，默认关闭 | optional, off by default | — |
| desktop.create.autoCleanOn.hint | 打开后，这个项目很久没用时会自动移到{term_trash}。不打开则一直保留。 | When on, this playground moves to the {term_trash} after going unused. When off, it is kept for good. | — |
| desktop.create.cancel.action | 取消 | Cancel | — |
| desktop.create.changeTemplate.action | 换一个模板 | Change template | — |
| desktop.create.cleanAfter.label | 多久没打开后清理 | Clean up after unused for | — |
| desktop.create.cleanSummary.hint | {days, plural, other {# 天}}没打开就移到{term_trash}，清理前一天会提醒你，可以随时改成保留。 | Moves to the {term_trash} after {days, plural, one {# day} other {# days}} unused. You get a reminder the day before, and can switch to Kept any time. | days：天数 |
| desktop.create.custom.label | 自定义 | Custom | — |
| desktop.create.customDays.label | 自定义天数 | Custom number of days | — |
| desktop.create.customDaysInvalid.hint | 请填大于 0 的整数 | Enter a whole number above 0 | — |
| desktop.create.days.label | {days, plural, other {# 天}} | {days, plural, one {# day} other {# days}} | days：天数 |
| desktop.create.dialog.title | 新建项目 | New playground | — |
| desktop.create.enter.hint | 按回车直接创建并运行 | Press Return to create and run | — |
| desktop.create.folder.hint | 文件夹：<code>{path}</code> | Folder: <code>{path}</code> | path：项目文件夹的显示路径，主目录缩成 ~，如 ~/Runyard/react19-4（用 code 标签包成等宽）；code：用来包住路径的标签，路径显示成等宽字体 |
| desktop.create.name.label | 名称 | Name | — |
| desktop.create.nameInvalid.hint | 只能用小写字母、数字和连字符，最长 64 个字符，首尾不能是连字符 | Use lowercase letters, digits and hyphens only, up to 64 characters, not starting or ending with a hyphen | — |
| desktop.create.nameTaken.hint | 这个名字已被占用 | This name is already taken | — |
| desktop.create.newProject.action | 新建项目 | New playground | — |
| desktop.create.note.label | 备注 | Note | — |
| desktop.create.note.placeholder | 这个项目用来做什么？ | What is this playground for? | — |
| desktop.create.optional.label | 可选 | optional | — |
| desktop.create.submit.action | 创建并运行 | Create and run | — |
| desktop.create.synced.hint | 资源库在网盘同步目录下，同步可能拖慢依赖安装，或让文件被临时锁住。 | The library is inside a cloud-synced folder. Syncing can slow dependency installs or briefly lock files. | — |
| desktop.create.template.label | 模板：{name} | Template: {name} | name：模板的显示名，已按语言取好 |
| desktop.create.title | 新建 | New | — |
| desktop.duration.seconds.label | {seconds} 秒 | {seconds} s | seconds：秒数，已按语言格式化的数字 |
| desktop.editor.binary.body | {name}（{size}）不能在编辑器里打开，它的内容也不会当作文字显示。 | {name} ({size}) can't be opened in the editor, and its contents aren't shown as text. | name：文件名；size：已格式化的文件大小 |
| desktop.editor.binary.title | 这个文件不是文本 | This file is not text | — |
| desktop.editor.breadcrumb.aria | 文件位置 | File path | — |
| desktop.editor.closeCancel.action | 取消 | Cancel | — |
| desktop.editor.closeDiscard.action | 不保存 | Don't save | — |
| desktop.editor.closePrompt.body | 不保存的话，这些修改会丢失。 | If you don't save, these changes will be lost. | — |
| desktop.editor.closePrompt.title | 保存对 {name} 的修改吗？ | Save changes to {name}? | name：文件名 |
| desktop.editor.closeSave.action | 保存 | Save | — |
| desktop.editor.deletedNotice.body | {name} 已在磁盘上被删除，内容还在编辑器里。按 {keys} 可以重新创建它。 | {name} was deleted on disk. Its content is still in the editor; press {keys} to create it again. | name：文件名；keys：保存快捷键，如 ⌘S |
| desktop.editor.diskChanged.body | 磁盘上的 {name} 已被别的程序修改。选定之前，这个文件不会自动保存。 | {name} was changed on disk by another program. It won't be saved automatically until you choose. | name：文件名 |
| desktop.editor.empty.body | 在左边的文件树里选一个文件，就能在这里编辑。 | Pick a file in the file tree on the left to edit it here. | — |
| desktop.editor.empty.title | 还没有打开的文件 | No file is open | — |
| desktop.editor.failed.body | 读取 {name} 时出了错。文件可能刚被移走或没有读取权限。 | Something went wrong reading {name}. It may have just been moved, or you may not have permission to read it. | name：文件名 |
| desktop.editor.failed.title | 打不开这个文件 | Can't open this file | — |
| desktop.editor.keepMine.action | 保留我的修改 | Keep my changes | — |
| desktop.editor.loading.label | 正在打开… | Opening… | — |
| desktop.editor.mixedEolNotice.body | 这个文件的换行符号不统一，保存时会统一成 {eol}。 | This file mixes line endings. Saving will make them all {eol}. | eol：统一成的换行符，LF 或 CRLF |
| desktop.editor.openExternal.action | 在外部编辑器中打开 | Open in external editor | — |
| desktop.editor.plainLargeNotice.body | 文件很大，已关闭语法高亮和智能提示。 | This file is very large, so syntax highlighting and suggestions are off. | — |
| desktop.editor.plainNotice.body | 文件较大，不做语法高亮。 | This file is large, so syntax highlighting is off. | — |
| desktop.editor.reveal.action | 在{term_fileManager}中显示 | Show in {term_fileManager} | — |
| desktop.editor.saveFailed.title | 没有保存成功 | Couldn't save | — |
| desktop.editor.saveFailedOther.body | 写入 {name} 时出了错（磁盘已满或文件夹不见了）。你的修改还在编辑器里，稍后再保存一次。 | Something went wrong writing {name} (the disk may be full or the folder is gone). Your changes are still in the editor; try saving again later. | name：文件名 |
| desktop.editor.saveFailedPermission.body | 没有写入 {name} 的权限。你的修改还在编辑器里，处理权限后再保存一次。 | No permission to write {name}. Your changes are still in the editor; fix the permission and save again. | name：文件名 |
| desktop.editor.saveFailedReadOnly.body | {name} 是只读的。你的修改还在编辑器里，改回可写后再保存一次。 | {name} is read-only. Your changes are still in the editor; make it writable and save again. | name：文件名 |
| desktop.editor.saveFailedRetry.action | 再保存一次 | Save again | — |
| desktop.editor.statusConflict.label | 磁盘上有改动 | Changed on disk | — |
| desktop.editor.statusDeleted.label | 已删除 | Deleted | — |
| desktop.editor.statusFailed.label | 保存失败 | Save failed | — |
| desktop.editor.statusSaved.label | 已保存 | Saved | — |
| desktop.editor.statusSaving.label | 保存中… | Saving… | — |
| desktop.editor.statusUnsaved.label | 未保存 | Unsaved | — |
| desktop.editor.tabClose.label | 关闭 {name} | Close {name} | name：文件名（用户的内容） |
| desktop.editor.tabDeleted.label | {name}（已删除） | {name} (deleted) | name：文件名（用户的内容） |
| desktop.editor.tabDeletedMark.label | 已删除 | Deleted | — |
| desktop.editor.tabUnsaved.label | {name}（未保存） | {name} (unsaved) | name：文件名（用户的内容） |
| desktop.editor.tabs.aria | 文件标签 | File tabs | — |
| desktop.editor.tooLarge.body | {name} 有 {size}，超过了编辑器能打开的上限（{limit}）。 | {name} is {size}, over the {limit} the editor can open. | name：文件名；size：已格式化的文件大小；limit：已格式化的上限大小 |
| desktop.editor.tooLarge.title | 文件太大，没有打开 | This file is too large to open | — |
| desktop.editor.useDisk.action | 用磁盘上的版本 | Use the disk version | — |
| desktop.empty.templates.hint | 或者直接用常用模板开始，点一下进入填写名称那一步： | Or start from a common template; one click takes you to the naming step: | — |
| desktop.error.title.label | 出错了：{title} | Error: {title} | title：错误的标题，来自 errors.<代码>.title，已是翻译好的句子 |
| desktop.failure.log.label | 安装日志 | Install log | — |
| desktop.failure.retry.action | 重试 | Retry | — |
| desktop.failure.stepCopy.label | 复制模板文件 | Copy template files | — |
| desktop.failure.stepInstall.label | 安装依赖 | Install dependencies | — |
| desktop.failure.stepReady.label | 就绪，显示页面 | Ready, show page | — |
| desktop.failure.stepStart.label | 启动开发服务 | Start dev server | — |
| desktop.failure.steps.aria | 启动步骤 | Start-up steps | — |
| desktop.linkNotice.linkInvalid.label | 这个链接无法识别 | This link is not recognized | — |
| desktop.linkNotice.newBusy.label | 已有一个待确认的新建请求，这个链接已忽略 | A create request is already waiting for confirmation, so this link was ignored | — |
| desktop.linkNotice.newFailed.label | 没能新建 <user>{value}</user> | Could not create <user>{value}</user> | value：链接里写的项目名称、模板标识或新名称（不翻译）；user：包住用户内容的标签 |
| desktop.linkNotice.newNameInvalid.label | 链接里的名称 <user>{value}</user> 不合法 | The name <user>{value}</user> in the link is not valid | value：链接里写的项目名称、模板标识或新名称（不翻译）；user：包住用户内容的标签 |
| desktop.linkNotice.newNameTaken.label | 名称 <user>{value}</user> 已被占用 | The name <user>{value}</user> is already taken | value：链接里写的项目名称、模板标识或新名称（不翻译）；user：包住用户内容的标签 |
| desktop.linkNotice.newNoTemplate.label | 本机没有模板 <user>{value}</user> | This Mac has no template <user>{value}</user> | value：链接里写的项目名称、模板标识或新名称（不翻译）；user：包住用户内容的标签 |
| desktop.linkNotice.newThrottled.label | 新建得太频繁，这个链接已忽略 | Too many projects created too fast, so this link was ignored | — |
| desktop.linkNotice.openInvalid.label | 链接里的项目名称不合法 | The playground name in the link is not valid | — |
| desktop.linkNotice.openMissing.label | 没有叫 <user>{value}</user> 的项目 | There is no playground named <user>{value}</user> | value：链接里写的项目名称、模板标识或新名称（不翻译）；user：包住用户内容的标签 |
| desktop.menu.about.label | 关于 Runyard | About Runyard | — |
| desktop.menu.actualSize.label | 实际大小 | Actual Size | — |
| desktop.menu.checkUpdates.label | 检查更新… | Check for Updates… | — |
| desktop.menu.closeTab.label | 关闭标签页 | Close Tab | — |
| desktop.menu.closeWindow.label | 关闭窗口 | Close Window | — |
| desktop.menu.copy.label | 拷贝 | Copy | — |
| desktop.menu.cut.label | 剪切 | Cut | — |
| desktop.menu.delete.label | 删除 | Delete | — |
| desktop.menu.devtools.label | 开发者工具 | Developer Tools | — |
| desktop.menu.edit.title | 编辑 | Edit | — |
| desktop.menu.file.title | 文件 | File | — |
| desktop.menu.forceReload.label | 强制重新载入 | Force Reload | — |
| desktop.menu.fullscreen.label | 切换全屏 | Toggle Full Screen | — |
| desktop.menu.help.title | 帮助 | Help | — |
| desktop.menu.helpPage.label | Runyard 帮助 | Runyard Help | — |
| desktop.menu.hide.label | 隐藏 Runyard | Hide Runyard | — |
| desktop.menu.hideOthers.label | 隐藏其他 | Hide Others | — |
| desktop.menu.minimize.label | 最小化 | Minimize | — |
| desktop.menu.new.label | 新建… | New… | — |
| desktop.menu.palette.label | 命令面板 | Command Palette | — |
| desktop.menu.paste.label | 粘贴 | Paste | — |
| desktop.menu.pasteMatch.label | 粘贴并匹配样式 | Paste and Match Style | — |
| desktop.menu.project.title | 项目 | Playground | — |
| desktop.menu.quickOpen.label | 快速打开文件 | Quick Open File | — |
| desktop.menu.quit.label | 退出 Runyard | Quit Runyard | — |
| desktop.menu.redo.label | 重做 | Redo | — |
| desktop.menu.reload.label | 重新载入 | Reload | — |
| desktop.menu.reportIssue.label | 报告问题… | Report an Issue… | — |
| desktop.menu.selectAll.label | 全选 | Select All | — |
| desktop.menu.services.label | 服务 | Services | — |
| desktop.menu.settings.label | 设置… | Settings… | — |
| desktop.menu.showAll.label | 全部显示 | Show All | — |
| desktop.menu.sidebar.label | 显示/隐藏侧栏 | Show/Hide Sidebar | — |
| desktop.menu.trash.label | 移到{term_trash}… | Move to {term_trash}… | — |
| desktop.menu.tree.label | 显示/隐藏文件树 | Show/Hide File Tree | — |
| desktop.menu.undo.label | 撤销 | Undo | — |
| desktop.menu.update.title | 检查更新 | Check for Updates | — |
| desktop.menu.updateFailed.body | 没能连上更新服务，请稍后再试。 | Could not reach the update service. Please try again later. | — |
| desktop.menu.updateLatest.body | 当前版本 {version} 已是最新版本。 | Version {version} is the latest version. | version：当前应用的版本号，如 0.3.0 |
| desktop.menu.updateUnavailable.body | 从源码运行的版本不检查更新。 | Builds run from source do not check for updates. | — |
| desktop.menu.view.title | 显示 | View | — |
| desktop.menu.window.title | 窗口 | Window | — |
| desktop.menu.windowFront.label | 前置全部窗口 | Bring All to Front | — |
| desktop.menu.windowZoom.label | 缩放 | Zoom | — |
| desktop.menu.zoomIn.label | 放大 | Zoom In | — |
| desktop.menu.zoomOut.label | 缩小 | Zoom Out | — |
| desktop.missing.command.label | 安装命令 | Install command | — |
| desktop.missing.copied.label | 已复制 | Copied | — |
| desktop.missing.copy.action | 复制命令 | Copy command | — |
| desktop.missing.current.label | 当前 | Found | — |
| desktop.missing.need.label | 需要 | Needs | — |
| desktop.missing.notInstalled.label | 未安装 | Not installed | — |
| desktop.missing.promise.label | Runyard 不会替你安装任何东西。命令是否执行由你决定。 | Runyard never installs anything for you. Whether to run the command is up to you. | — |
| desktop.missing.recheck.action | 重新检测 | Check again | — |
| desktop.missing.requirement.label | {tool} {required} | {tool} {required} | tool：工具标识，如 go、node；required：需要的版本范围，原样显示 |
| desktop.missing.site.label | 官网 | Website | — |
| desktop.notice.dismiss.aria | 关闭提示 | Dismiss notice | — |
| desktop.notice.region.aria | 提示 | Notices | — |
| desktop.output.aria | 进程输出 | Process output | — |
| desktop.output.empty.label | 还没有输出。 | No output yet. | — |
| desktop.output.view.action | 查看完整输出 | View full output | — |
| desktop.palette.commands.aria | 命令面板 | Command palette | — |
| desktop.palette.commandsEmpty.label | 没有匹配的命令 | No matching commands | — |
| desktop.palette.commandsHint.label | 删掉 > 查找文件 | Delete > to find files | — |
| desktop.palette.commandsPlaceholder.label | 输入命令名称 | Type a command | — |
| desktop.palette.enterKey.label | 回车 | Return | — |
| desktop.palette.escape.label | esc | esc | — |
| desktop.palette.execute.label | 执行 | run | — |
| desktop.palette.files.aria | 快速打开 | Quick open | — |
| desktop.palette.filesEmpty.label | 没有匹配的文件 | No matching files | — |
| desktop.palette.filesHint.label | 输入 > 执行命令 | Type > for commands | — |
| desktop.palette.filesPlaceholder.label | 按名称查找文件 | Find a file by name | — |
| desktop.palette.groupApp.label | 应用 | App | — |
| desktop.palette.groupEditor.label | 编辑器 | Editor | — |
| desktop.palette.groupProject.label | 项目 | Playground | — |
| desktop.palette.groupRecentCommands.label | 最近使用 | Recently used | — |
| desktop.palette.groupRecentFiles.label | 最近打开 | Recently opened | — |
| desktop.palette.move.label | 移动 | move | — |
| desktop.palette.moveKeys.label | 上下键 | ↑↓ | — |
| desktop.palette.open.label | 打开 | open | — |
| desktop.palette.results.aria | 结果 | Results | — |
| desktop.pathNotice.title.label | <user>{name}</user> 已创建 | <user>{name}</user> was created | name：新建项目的名称（不翻译）；user：包住用户内容的标签 |
| desktop.picker.all.label | 全部 | All | — |
| desktop.picker.arrowsKey.label | 上下键 | ↑ ↓ | — |
| desktop.picker.defaultName.label | 默认名称 | Default name | — |
| desktop.picker.dialog.aria | 选择模板 | Choose a template | — |
| desktop.picker.empty.hint | 没有可用的模板。 | No templates available. | — |
| desktop.picker.enterKey.label | 回车 | Return | — |
| desktop.picker.escKey.label | esc | esc | — |
| desktop.picker.list.aria | 模板列表 | Templates | — |
| desktop.picker.move.hint | 移动 | Move | — |
| desktop.picker.next.hint | 下一步：填写名称和备注 | Next: name and note | — |
| desktop.picker.noMatch.hint | 没有匹配的模板。 | No matching templates. | — |
| desktop.picker.rail.aria | 模板分类 | Template categories | — |
| desktop.picker.recent.label | 最近使用 | Recent | — |
| desktop.picker.search.label | 搜索模板 | Search templates | — |
| desktop.picker.search.placeholder | 搜索模板：名称、框架、语言 | Search templates: name, framework, language | — |
| desktop.port.body.label | 已改用 {actual} 端口。 | Switched to port {actual}. | actual：现在实际使用的端口，纯数字字符串 |
| desktop.port.dismiss.action | 知道了 | Got it | — |
| desktop.port.occupant.label | 占用者：{name}（PID {pid}） | In use by: {name} (PID {pid}) | name：占用端口的进程名，原样显示；pid：占用者的进程号 |
| desktop.port.title | {wanted} 端口{reason, select, PORT_RESERVED {被系统保留} other {被占用}} | Port {wanted} is {reason, select, PORT_RESERVED {reserved by the system} other {in use}} | wanted：原来想用的端口，纯数字字符串；reason：PORT_OCCUPIED 或 PORT_RESERVED |
| desktop.port.untouched.label | 没有结束占用者，它仍在运行。 | The other program was not stopped; it is still running. | — |
| desktop.preview.devtools.action | 开发者工具 | Developer tools | — |
| desktop.preview.frame.label | 页面预览的截图 | Screenshot of the page preview | — |
| desktop.preview.openExternal.action | 在浏览器中打开 | Open in browser | — |
| desktop.preview.reload.action | 刷新 | Reload | — |
| desktop.preview.waiting.label | 页面还没有就绪，就绪后会显示在这里。 | The page isn't ready yet. It shows up here once it is. | — |
| desktop.quitConfirm.body | 这些终端里还有命令在运行，退出会结束它们。 | Commands are still running in these terminals. Quitting will end them. | — |
| desktop.quitConfirm.cancel.action | 取消 | Cancel | — |
| desktop.quitConfirm.confirm.action | 退出 | Quit | — |
| desktop.quitConfirm.item.label | {project}：{command} | {project}: {command} | project：项目名，用户自己起的，不翻译；command：命令名，不翻译 |
| desktop.quitConfirm.title | 退出 Runyard？ | Quit Runyard? | — |
| desktop.request.aria | 请求面板 | Request panel | — |
| desktop.request.autoResend.label | 服务重载后自动重发 | Re-send after reload | — |
| desktop.request.autoResent.label | {time} 自动重发 | {time} auto-resent | time：自动重发的时刻，时分秒，如 20:11:02，由格式化函数生成 |
| desktop.request.bodyEmpty.label | 响应体是空的 | The response body is empty | — |
| desktop.request.copied.label | 已复制 | Copied | — |
| desktop.request.copyCurl.action | 复制为 curl | Copy as curl | — |
| desktop.request.disconnected.label | 服务中途断开了连接 | The service closed the connection midway | — |
| desktop.request.empty.label | 发送请求后，响应显示在这里 | The response will show here after you send a request | — |
| desktop.request.headers.label | 请求头 | Headers | — |
| desktop.request.headers.placeholder | 每行一个，如 content-type: application/json | One per line, e.g. content-type: application/json | — |
| desktop.request.invalid.label | 请求里有不能发送的字符，检查路径和请求头 | The request has characters that can't be sent; check the path and headers | — |
| desktop.request.meta.label | {duration} · {size} | {duration} · {size} | duration：耗时，如 12 ms，由格式化函数生成；size：响应体大小，如 156 B，由格式化函数生成 |
| desktop.request.method.aria | 请求方法 | Request method | — |
| desktop.request.methodOption.label | {method} | {method} | method：HTTP 方法名（GET、POST 等），技术词，不翻译 |
| desktop.request.notReady.label | 服务还没就绪，请求没有发出 | The service is not ready; the request was not sent | — |
| desktop.request.openInBrowser.action | 在浏览器中打开 | Open in browser | — |
| desktop.request.path.aria | 请求路径 | Request path | — |
| desktop.request.payload.label | 请求体 | Body | — |
| desktop.request.payload.placeholder | 请求体（GET 不发送） | Request body (not sent with GET) | — |
| desktop.request.pending.label | 正在等待响应… | Waiting for the response… | — |
| desktop.request.response.title | 响应 | Response | — |
| desktop.request.responseBody.label | 响应体 | Body | — |
| desktop.request.responseHeaders.label | 响应头 | Headers | — |
| desktop.request.responseTabs.aria | 响应内容 | Response content | — |
| desktop.request.send.action | 发送 | Send | — |
| desktop.request.starting.hint | 服务还没就绪，就绪后才能发送 | The service is not ready yet; you can send once it is | — |
| desktop.request.stopped.hint | 服务没有在运行，运行后才能发送 | The service is not running; run it to send | — |
| desktop.request.tabs.aria | 请求内容 | Request content | — |
| desktop.request.timeout.label | 等了 30 秒仍没有响应，已超时 | No response after 30 seconds; timed out | — |
| desktop.request.tooLarge.label | 响应超过 5 MB，没有显示 | The response is over 5 MB and is not shown | — |
| desktop.request.unreachable.label | 连不上服务 | Can't reach the service | — |
| desktop.rerun.action | 重新运行 | Run again | — |
| desktop.restart.action | 重启 | Restart | — |
| desktop.run.action | 运行 | Run | — |
| desktop.runbar.aria | 运行条 | Run bar | — |
| desktop.runbar.cliHint.label | 由命令行启动，关闭标签页不会停止 | Started from the CLI; closing the tab will not stop it | — |
| desktop.runbar.closeHint.label | 关闭标签页即停止 | Stops when the tab closes | — |
| desktop.runbar.missing.label | 缺少 {tool} | {tool} is missing | tool：工具标识，如 go、node |
| desktop.runbar.note.label | {template} · {hint} | {template} · {hint} | template：模板名（来自模板，已按界面语言选好）；hint：持有者说明，如“关闭标签页即停止” |
| desktop.runbar.state.label | {state} :{port} | {state} :{port} | state：运行状态的名字，来自 runState.<状态>；port：端口号，纯数字字符串（不加千分位） |
| desktop.runbar.tooOld.label | {tool} 版本过低 | {tool} is too old | tool：工具标识，如 go、node |
| desktop.saveTemplate.cancel.action | 取消 | Cancel | — |
| desktop.saveTemplate.description.label | 说明 | Description | — |
| desktop.saveTemplate.description.placeholder | 一句话说明这个模板是做什么的 | One line about what this template is for | — |
| desktop.saveTemplate.excluded.label | 默认不包含 | Not included by default | — |
| desktop.saveTemplate.files.aria | 选择要放进模板的文件 | Choose the files to put in the template | — |
| desktop.saveTemplate.files.label | 包含的文件 | Included files | — |
| desktop.saveTemplate.footer.hint | 保存后出现在新建时的“我的”分组 · {path} | Appears under Mine when creating · {path} | path：新模板文件夹的显示路径，如 ~/.runyard/templates/todo-api |
| desktop.saveTemplate.id.hint | 只能用小写字母、数字和连字符，命令行里用它：<code>runyard new {id}</code> | Lowercase letters, numbers and hyphens only. Used on the command line: <code>runyard new {id}</code> | id：模板标识；还没填时是“<标识>”这样的占位；code：包住命令的标签，显示成等宽字体 |
| desktop.saveTemplate.id.label | 模板标识 | Template id | — |
| desktop.saveTemplate.idInvalid.hint | 标识只能用小写字母、数字和连字符，首尾不能是连字符 | Use lowercase letters, digits and hyphens only, and no hyphen at either end | — |
| desktop.saveTemplate.idPlaceholder.label | '<'标识'>' | '<'id'>' | — |
| desktop.saveTemplate.idTaken.hint | 这个标识已经被占用，换一个 | This id is already taken. Pick another one | — |
| desktop.saveTemplate.listComma.label | ， | , | — |
| desktop.saveTemplate.name.label | 模板名称 | Template name | — |
| desktop.saveTemplate.reasonBuild.label | 构建产物，不包含 | build output, not included | — |
| desktop.saveTemplate.reasonDeps.label | 依赖，不包含 | dependencies, not included | — |
| desktop.saveTemplate.reasonSecret.label | 可能含密钥，默认不包含 | may contain secrets, off by default | — |
| desktop.saveTemplate.replaceName.label | 把项目名替换成变量，新建时自动换成新项目的名字 | Replace the playground name with a variable so new playgrounds get their own name | — |
| desktop.saveTemplate.requires.label | 依赖的运行环境 | Required tools | — |
| desktop.saveTemplate.requiresFrom.body | 沿用原模板 {template}： | Same as the original template {template}: | template：原模板的显示名，已按语言取好 |
| desktop.saveTemplate.submit.action | 保存模板 | Save template | — |
| desktop.saveTemplate.subtitle.body | 把 {name} 现在的样子存成模板，以后新建时可以直接用。 | Save {name} as it is now, so you can start from it later. | name：项目名称（用户的内容，不翻译） |
| desktop.saveTemplate.title | 另存为模板 | Save as template | — |
| desktop.script.autoRun.label | 保存后自动运行 | Run on save | — |
| desktop.script.autoRunGlobalOff.hint | 全局设置已关闭 | Turned off in settings | — |
| desktop.script.ended.label | {state} · 退出码 {exitCode} · {duration} | {state} · exit code {exitCode} · {duration} | state：运行状态的名字，来自 runState.<状态>；exitCode：进程的退出码；duration：这次运行的总耗时 |
| desktop.script.endedNoCode.label | {state} · {duration} | {state} · {duration} | state：运行状态的名字，来自 runState.<状态>；duration：这次运行的总耗时 |
| desktop.script.failedTail.label | 已有的最后几行输出 | Last lines of output so far | — |
| desktop.script.input.aria | 给程序的输入 | Input for the program | — |
| desktop.script.input.placeholder | 输入内容后回车发送给程序 | Type input and press Return to send to the program | — |
| desktop.script.inputDisabled.hint | 仅程序运行中可用 | Only while the program runs | — |
| desktop.script.running.label | {state} · 已 {duration} | {state} · {duration} | state：运行状态的名字，来自 runState.<状态>；duration：已经运行的时长，如 3.2 秒 |
| desktop.script.stale.label | 过期 | Stale | — |
| desktop.script.staleNotice.label | 代码有语法错误，没有重新运行。下面是上一次的输出。 | The code has a syntax error and was not re-run. Below is the previous output. | — |
| desktop.script.startFailed.body | 程序没能启动。项目文件原样保留，代码可以照常编辑。 | The program could not start. The playground files are untouched and you can still edit the code. | — |
| desktop.slow.body | 启动比平时慢，进程还在运行。下面的输出可以看到进度。 | Starting is taking longer than usual, but the process is still running. The output below shows progress. | — |
| desktop.slow.title | 启动中（较慢） | Starting (slow) | — |
| desktop.start.body | 项目已经建好，放在 {folder}。页面准备好后会自动显示在这里。 | The playground is ready in {folder}. The page will appear here automatically once it is up. | folder：项目文件夹的显示路径，主目录缩成 ~ |
| desktop.start.hint | 通常不到 2 秒 | Usually under 2 s | — |
| desktop.start.running.label | 进行中 | In progress | — |
| desktop.start.stop.action | 停止启动 | Stop | — |
| desktop.start.title | 正在启动 {name} | Starting {name} | name：项目名 |
| desktop.state.idle.label | 未运行 | Not running | — |
| desktop.stop.action | 停止 | Stop | — |
| desktop.stopped.body | 你手动停止了它。点“运行”重新启动；关闭标签页后再打开，也会自动运行。 | You stopped it. Choose Run to start it again; closing the tab and opening it again also runs it. | — |
| desktop.tab.cli.label | 命令行 | CLI | — |
| desktop.templates.create.action | 用它新建 | Create from it | — |
| desktop.templates.detail.aria | 模板详情 | Template details | — |
| desktop.templates.detailGone.hint | 这个模板不见了 | This template is gone | — |
| desktop.templates.edit.hint | 想改内置模板：先用它新建一个项目，改好后“另存为模板”。 | To change a built-in template, create a playground from it, edit it, then use “Save as template”. | — |
| desktop.templates.empty.hint | 还没有模板 | No templates yet | — |
| desktop.templates.fallback.hint | 没有 {tool} 时会改用 {fallback} | Falls back to {fallback} when {tool} is missing | tool：首选的工具名，如 pnpm；fallback：缺它时改用的工具名，如 npm |
| desktop.templates.files.title | 包含的文件 | Included files | — |
| desktop.templates.filesEmpty.hint | 没有文件 | No files | — |
| desktop.templates.hereColumn.label | 这台电脑 | This Mac | — |
| desktop.templates.invalid.label | 无效 | Invalid | — |
| desktop.templates.list.aria | 模板列表 | Templates | — |
| desktop.templates.loadFailed.hint | 读取模板失败，请稍后再试 | Could not read the templates. Try again in a moment. | — |
| desktop.templates.problemEntry.label | 入口文件不存在 | The entry file does not exist | — |
| desktop.templates.problemFormat.label | 模板格式比这个版本新 | The template format is newer than this version | — |
| desktop.templates.problemName.label | 缺少英文名称 | The English name is missing | — |
| desktop.templates.problemOther.label | 没有通过格式检查：{rule} | Failed the format check: {rule} | rule：检查规则的标识，如 entry-missing（给开发者看，不翻译） |
| desktop.templates.problemReserved.label | 标识和内置模板重名 | The id is already used by a built-in template | — |
| desktop.templates.problemRunner.label | 找不到它指定的运行器 | The runner it names was not found | — |
| desktop.templates.problemTemplateJson.label | 模板文件有问题 | The template file has a problem | — |
| desktop.templates.rangeAnd.label | 且 | and | — |
| desktop.templates.readyLog.label | 日志里出现 {match} | The log shows {match} | match：日志里要匹配的特征（正则文本，用 code 的等宽样式显示，不翻译） |
| desktop.templates.readyPort.label | 端口可以连上 | The port accepts connections | — |
| desktop.templates.requiredColumn.label | 需要的版本 | Required | — |
| desktop.templates.requires.title | 依赖的运行环境 | Runtime requirements | — |
| desktop.templates.requiresNone.hint | 不依赖任何工具 | Needs no tools | — |
| desktop.templates.run.title | 运行方式 | How it runs | — |
| desktop.templates.runInstall.label | 安装依赖 | Install | — |
| desktop.templates.runReady.label | 就绪判断 | Ready when | — |
| desktop.templates.runStart.label | 启动 | Start | — |
| desktop.templates.sourceBuiltin.label | 内置 | Built-in | — |
| desktop.templates.sourceUser.label | 我的 | Mine | — |
| desktop.templates.statusColumn.label | 状态 | Status | — |
| desktop.templates.statusMet.label | 满足 | Met | — |
| desktop.templates.statusMissing.label | 没找到 | Not found | — |
| desktop.templates.statusTooOld.label | 版本过低 | Too old | — |
| desktop.templates.summary.label | {builtin, plural, other {# 个内置}} · {user, plural, other {# 个我的}} | {builtin, plural, one {# built-in} other {# built-in}} · {user, plural, one {# mine} other {# mine}} | builtin：内置模板的个数；user：用户自己的模板的个数 |
| desktop.templates.title | 模板 | Templates | — |
| desktop.templates.toolColumn.label | 工具 | Tool | — |
| desktop.templates.unmaintained.label | 不再维护 | Unmaintained | — |
| desktop.terminal.aria | 终端 | Terminal | — |
| desktop.terminal.endedExited.label | 终端已结束（退出码 {exitCode}） | Terminal ended (exit code {exitCode}) | exitCode：shell 的退出码，数字 |
| desktop.terminal.endedHostCrashed.label | 终端意外结束 | Terminal ended unexpectedly | — |
| desktop.terminal.endedRenamed.label | 项目已改名，终端已关闭 | The playground was renamed, so the terminal was closed | — |
| desktop.terminal.endedSignal.label | 终端已结束 | Terminal ended | — |
| desktop.terminal.endedStartFailed.label | 终端没能启动 | The terminal could not start | — |
| desktop.terminal.reopen.action | 重新打开终端 | Reopen terminal | — |
| desktop.terminal.shellFallback.label | 没能启动 {shell}（{reason, select, notFound {文件不存在} notExecutable {不能执行} spawnFailed {启动失败} other {启动后立刻退出}}），已改用 {fallback}。 | Could not start {shell} ({reason, select, notFound {file not found} notExecutable {not executable} spawnFailed {failed to start} other {exited right away}}). Using {fallback} instead. | shell：没能启动的 shell 的路径，不翻译；fallback：改用的 shell 的路径，不翻译；reason：原因代码：notFound、notExecutable、spawnFailed，其余都当“启动后立刻退出” |
| desktop.terminalFind.aria | 在终端里查找 | Find in terminal | — |
| desktop.terminalFind.case.aria | 区分大小写 | Match case | — |
| desktop.terminalFind.case.label | Aa | Aa | — |
| desktop.terminalFind.close.aria | 关闭查找 | Close find | — |
| desktop.terminalFind.count.label | 第 {index} 个，共 {total} 个 | {index} of {total} | index：当前是第几个，从 1 开始；total：一共几个 |
| desktop.terminalFind.field.aria | 查找内容 | Search text | — |
| desktop.terminalFind.next.aria | 下一个 | Next match | — |
| desktop.terminalFind.none.label | 无结果 | No results | — |
| desktop.terminalFind.previous.aria | 上一个 | Previous match | — |
| desktop.terminalFind.regex.aria | 使用正则表达式 | Use regular expression | — |
| desktop.terminalFind.regex.label | .* | .* | — |
| desktop.terminalFind.word.aria | 全词匹配 | Match whole word | — |
| desktop.terminalFind.word.label | ab | ab | — |
| desktop.terminalMenu.aria | 终端菜单 | Terminal menu | — |
| desktop.terminalMenu.clear.action | 清除 | Clear | — |
| desktop.terminalMenu.clear.hint | {term_clearShortcut} | {term_clearShortcut} | — |
| desktop.terminalMenu.copy.action | 复制 | Copy | — |
| desktop.terminalMenu.copy.hint | {term_copyShortcut} | {term_copyShortcut} | — |
| desktop.terminalMenu.paste.action | 粘贴 | Paste | — |
| desktop.terminalMenu.paste.hint | {term_pasteShortcut} | {term_pasteShortcut} | — |
| desktop.terminalMenu.selectAll.action | 全选 | Select all | — |
| desktop.terminalMenu.selectAll.hint | {term_selectAllShortcut} | {term_selectAllShortcut} | — |
| desktop.update.banner.label | Runyard {latest} 已发布，你现在用的是 {current}。 | Runyard {latest} is out. You are using {current}. | latest：新版本号，如 0.3.0；current：当前版本号，如 0.2.0 |
| desktop.update.download.action | 下载 | Download | — |
| desktop.update.later.action | 以后再说 | Later | — |
| desktop.update.region.aria | 新版本 | New version | — |
| desktop.urlConfirm.cancel.action | 取消 | Cancel | — |
| desktop.urlConfirm.claimed.label | 自称来自 | Claims to be from | — |
| desktop.urlConfirm.confirm.action | 新建并运行 | Create and run | — |
| desktop.urlConfirm.folder.label | 文件夹 | Folder | — |
| desktop.urlConfirm.from.label | 来自一个链接 | From a link | — |
| desktop.urlConfirm.name.label | 名称 | Name | — |
| desktop.urlConfirm.preview.label | 来自项目 <user>{name}</user> 的预览页 | From the preview of playground <user>{name}</user> | name：项目名称（不翻译）；user：包住用户内容的标签 |
| desktop.urlConfirm.source.label | 来源 | Source | — |
| desktop.urlConfirm.template.label | 模板 | Template | — |
| desktop.urlConfirm.title | 要新建并运行这个项目吗？ | Create and run this playground? | — |
| desktop.urlConfirm.unknown.label | 未知来源 | Unknown source | — |
| desktop.urlConfirm.warning.label | 这个来源是链接自己写的，Runyard 无法核实。新建后会安装依赖并运行模板里的代码，只在你信任它时继续。 | The link wrote this source itself and Runyard cannot verify it. Creating the project installs dependencies and runs the template's code, so continue only if you trust it. | — |
| desktop.window.title | Runyard | Runyard | — |
| errors.APP_REQUIRED.body | open 和 screenshot 要由桌面应用来完成，命令行自己做不到。 | The open and screenshot commands are carried out by the desktop app. The command line cannot do them on its own. | — |
| errors.APP_REQUIRED.hint | 打开 Runyard 应用后重新运行。 | Open the Runyard app, then run it again. | — |
| errors.APP_REQUIRED.hintCli | 打开 Runyard 应用后重新运行这条命令。 | Open the Runyard app, then run the command again. | — |
| errors.APP_REQUIRED.title | 这条命令需要 Runyard 桌面应用 | This command needs the Runyard desktop app | — |
| errors.BUSY.body | 它正在安装依赖或启动，现在不能改名，没有做任何改动。 | It is installing dependencies or starting, so it cannot be renamed right now. Nothing was changed. | — |
| errors.BUSY.hint | 等它就绪或停止后再试。 | Try again once it is ready or stopped. | — |
| errors.BUSY.hintCli | 等它就绪，或运行 runyard stop {name} 停止它，然后重新运行这条命令。 | Wait until it is ready, or stop it with runyard stop {name}, then run the command again. | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.BUSY.title | 项目 {name} 正忙 | Playground {name} is busy | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.CLIENT_OUTDATED.body | 后台的管理进程比它新，并且要求更高的版本。没有发送任何请求。 | The background process is newer and requires a newer version. No request was sent. | — |
| errors.CLIENT_OUTDATED.hint | 把 Runyard 升级到最新版本。 | Update Runyard to the latest version. | — |
| errors.CLIENT_OUTDATED.hintCli | 升级 Runyard 桌面应用，命令行随应用一起安装。 | Update the Runyard desktop app. The command line is installed with it. | — |
| errors.CLIENT_OUTDATED.title | 当前使用的 Runyard 版本过旧 | The Runyard you are using is out of date | — |
| errors.DATA_FROM_NEWER_VERSION.body | {file} 的格式版本是 {found}，当前程序最高认识 {supported}。为了不损坏它，这次改动没有写入；读取不受影响。 | {file} has format version {found}, and this version of Runyard understands up to {supported}. To avoid damaging it, the change was not written. Reading is not affected. | file：数据文件名，例如 settings.json；原样显示，不翻译；found：文件里记录的格式版本号（整数）；supported：当前程序认识的最高格式版本号（整数） |
| errors.DATA_FROM_NEWER_VERSION.hint | 升级 Runyard 后再试。 | Update Runyard, then try again. | — |
| errors.DATA_FROM_NEWER_VERSION.hintCli | 升级 Runyard 桌面应用后重新运行这条命令。 | Update the Runyard desktop app, then run the command again. | — |
| errors.DATA_FROM_NEWER_VERSION.title | {file} 来自更新版本的 Runyard | {file} was written by a newer version of Runyard | file：数据文件名，例如 settings.json；原样显示，不翻译 |
| errors.DEPS_OFFLINE.body | 现在没有网络，而这个项目需要的依赖在本机没有缓存。已缓存的依赖不受影响，代码可以照常编辑。 | You are offline and the dependencies this playground needs are not cached on this computer. Cached dependencies are not affected, and you can still edit the code. | — |
| errors.DEPS_OFFLINE.hint | 联网后点“重试”；如果用了镜像源或代理，也去设置里检查。 | Reconnect, then click Retry. If you use a registry mirror or proxy, check it in Settings. | — |
| errors.DEPS_OFFLINE.hintCli | 联网后运行 runyard run {name}。 | Reconnect, then run runyard run {name}. | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.DEPS_OFFLINE.title | 项目 {name} 的依赖没装上：离线且依赖未缓存 | Dependencies for playground {name} were not installed: offline and not cached | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.FOLDER_MISSING.body | 它不在原来的位置了，可能被移动、改名或删除。 | It is no longer where it was. It may have been moved, renamed or deleted. | — |
| errors.FOLDER_MISSING.hint | 重新定位这个文件夹，或把项目从资源库移除；也可以在{term_fileManager}中查看上一级文件夹。 | Locate the folder again or remove the playground from the library. You can also look in the enclosing folder in {term_fileManager}. | — |
| errors.FOLDER_MISSING.hintCli | 把文件夹放回资源库里，再重新运行这条命令。 | Put the folder back in the library, then run the command again. | — |
| errors.FOLDER_MISSING.title | 找不到项目 {name} 的文件夹 | The folder of playground {name} is missing | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.INTERNAL.body | 命令因为 Runyard 自己的意外错误没有完成。 | The command did not finish because of an unexpected error in Runyard. | — |
| errors.INTERNAL.hint | 可以在设置里导出诊断信息。 | You can export diagnostics from Settings. | — |
| errors.INTERNAL.hintCli | 运行 runyard doctor --bundle 导出诊断信息。 | Run runyard doctor --bundle to export diagnostics. | — |
| errors.INTERNAL.title | Runyard 内部出了意外错误 | Something went wrong inside Runyard | — |
| errors.NAME_EXISTS.body | {kind, select, template {已经有同标识的内置模板或用户模板，现有模板没有改动。} none {资源库里已经有同名的项目，现有项目没有改动。} other {资源库里已经有同名的项目，现有项目没有改动。}} | {kind, select, template {A built-in or user template already has this ID. The existing template is unchanged.} none {The library already has a playground with this name. The existing playground is unchanged.} other {The library already has a playground with this name. The existing playground is unchanged.}} | kind：对象种类：template 是模板标识，缺省或 playground 是项目名称 |
| errors.NAME_EXISTS.hint | {kind, select, template {换一个标识。} none {换一个名称。} other {换一个名称。}} | {kind, select, template {Choose a different ID.} none {Choose a different name.} other {Choose a different name.}} | kind：对象种类：template 是模板标识，缺省或 playground 是项目名称 |
| errors.NAME_EXISTS.hintCli | {kind, select, template {换一个标识，重新运行这条命令。} none {用 runyard run {name} 运行已有的项目，在同一条命令里加 --if-exists reuse，或换一个名称重新运行。} other {用 runyard run {name} 运行已有的项目，在同一条命令里加 --if-exists reuse，或换一个名称重新运行。}} | {kind, select, template {Run the command again with a different ID.} none {Run runyard run {name} to use the existing playground, add --if-exists reuse to the same command, or run it again with a different name.} other {Run runyard run {name} to use the existing playground, add --if-exists reuse to the same command, or run it again with a different name.}} | name：项目名称（也是文件夹名）或模板标识；命令行传路径时是用户给的原文；kind：对象种类：template 是模板标识，缺省或 playground 是项目名称 |
| errors.NAME_EXISTS.title | {kind, select, template {模板标识 {name} 已被占用} none {项目名称 {name} 已被占用} other {项目名称 {name} 已被占用}} | {kind, select, template {A template with the ID {name} already exists} none {A playground named {name} already exists} other {A playground named {name} already exists}} | name：项目名称（也是文件夹名）或模板标识；命令行传路径时是用户给的原文；kind：对象种类：template 是模板标识，缺省或 playground 是项目名称 |
| errors.NAME_INVALID.body | {kind, select, template {标识} none {名称} other {名称}}只能包含小写字母、数字和连字符，最长 64 个字符，开头和结尾不能是连字符。 | {kind, select, template {An ID} none {A name} other {A name}} can contain only lowercase letters, digits and hyphens. It can be up to 64 characters long and cannot start or end with a hyphen. | kind：对象种类：template 是模板标识，缺省或 playground 是项目名称 |
| errors.NAME_INVALID.hint | {kind, select, template {改用符合这些规则的标识。} none {改用符合这些规则的名称。} other {改用符合这些规则的名称。}} | {kind, select, template {Use an ID that follows these rules.} none {Use a name that follows these rules.} other {Use a name that follows these rules.}} | kind：对象种类：template 是模板标识，缺省或 playground 是项目名称 |
| errors.NAME_INVALID.hintCli | {kind, select, template {用符合这些规则的标识重新运行这条命令。} none {用符合这些规则的名称重新运行这条命令。} other {用符合这些规则的名称重新运行这条命令。}} | {kind, select, template {Run the command again with an ID that follows these rules.} none {Run the command again with a name that follows these rules.} other {Run the command again with a name that follows these rules.}} | kind：对象种类：template 是模板标识，缺省或 playground 是项目名称 |
| errors.NAME_INVALID.title | {kind, select, template {模板标识「{name}」不合法} none {项目名称「{name}」不合法} other {项目名称「{name}」不合法}} | {kind, select, template {Invalid template ID "{name}"} none {Invalid playground name "{name}"} other {Invalid playground name "{name}"}} | name：项目名称（也是文件夹名）或模板标识；命令行传路径时是用户给的原文；kind：对象种类：template 是模板标识，缺省或 playground 是项目名称 |
| errors.NAME_RESERVED.body | con、nul、com1 这类名称是保留名，Runyard 不接受它们作为项目名称。 | Names such as con, nul and com1 are reserved, and Runyard does not accept them as playground names. | — |
| errors.NAME_RESERVED.hint | 换一个不是保留名的名称。 | Choose a name that is not reserved. | — |
| errors.NAME_RESERVED.hintCli | 换一个不是保留名的名称，重新运行这条命令。 | Run the command again with a name that is not reserved. | — |
| errors.NAME_RESERVED.title | 「{name}」是保留名，不能用作项目名称 | "{name}" is a reserved name and cannot be used as a playground name | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.NOT_SUPPORTED.body | 当前版本的 Runyard 或当前系统还没有实现这个功能。 | This version of Runyard or this system does not implement it yet. | — |
| errors.NOT_SUPPORTED.hint | 目前无法完成这个操作。 | This operation cannot be completed for now. | — |
| errors.NOT_SUPPORTED.hintCli | 目前无法完成这个操作。 | This operation cannot be completed for now. | — |
| errors.NOT_SUPPORTED.title | 这个功能暂不支持 | This is not supported yet | — |
| errors.PATH_LOCKED.body | 文件夹正被其他程序使用，或者没有权限修改它。操作没有完成，文件夹保持原样。 | Another program is using the folder, or you do not have permission to change it. The operation did not complete and the folder is unchanged. | — |
| errors.PATH_LOCKED.hint | 关闭正在使用这个文件夹的程序后重试。 | Close any program that is using the folder, then try again. | — |
| errors.PATH_LOCKED.hintCli | 关闭正在使用这个文件夹的程序，重新运行这条命令。 | Close any program that is using the folder, then run the command again. | — |
| errors.PATH_LOCKED.title | 项目 {name} 的文件夹被其他程序占用 | The folder of playground {name} is in use by another program | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.PATH_TOO_LONG.body | 路径超过了系统允许的长度，操作没有完成，文件夹保持原样。 | The path is longer than the system allows. The operation did not complete and the folder is unchanged. | — |
| errors.PATH_TOO_LONG.hint | 缩短项目名称，或把资源库放到更短的路径下。 | Shorten the playground name, or move the library to a shorter path. | — |
| errors.PATH_TOO_LONG.hintCli | 缩短项目名称，或把资源库放到更短的路径下，然后重新运行这条命令。 | Shorten the playground name, or move the library to a shorter path, then run the command again. | — |
| errors.PATH_TOO_LONG.title | 项目 {name} 的路径太长 | The path of playground {name} is too long | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.PLAYGROUND_NOT_FOUND.body | 资源库里没有叫这个名字的项目。 | The library has no playground with this name. | — |
| errors.PLAYGROUND_NOT_FOUND.hint | 检查名称是否拼写正确。 | Check that the name is spelled correctly. | — |
| errors.PLAYGROUND_NOT_FOUND.hintCli | 运行 runyard status 查看现有的项目。 | Run runyard status to list existing playgrounds. | — |
| errors.PLAYGROUND_NOT_FOUND.title | 找不到项目「{name}」 | Playground "{name}" not found | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.PORT_IN_USE.body | 你指定了这个端口，所以没有启动项目，也没有改用别的端口。 | You asked for this exact port, so the playground was not started and Runyard did not switch to another port. | — |
| errors.PORT_IN_USE.hint | 关掉正在使用这个端口的程序，或者不指定端口再启动。 | Stop the program that is using the port, or start without choosing a port. | — |
| errors.PORT_IN_USE.hintCli | 找到正在使用 {port} 端口的程序并关掉它，或者去掉 --port 重新运行，使用登记的端口。 | Find the program that is using port {port} and stop it, or run the command again without --port to use the registered port. | port：用户指定的端口号；原样显示，不加千分位 |
| errors.PORT_IN_USE.title | {port} 端口已被占用 | Port {port} is already in use | port：用户指定的端口号；原样显示，不加千分位 |
| errors.READY_TIMEOUT.body | 进程仍在运行，没有被停止，只是命令不再等待它。 | The process is still running and was not stopped. The command just stopped waiting for it. | — |
| errors.READY_TIMEOUT.hint | 过一会儿再看它是否就绪，或者查看输出。 | Check again in a moment whether it is ready, or read the output. | — |
| errors.READY_TIMEOUT.hintCli | 运行 runyard status {name} 看它是否就绪，或运行 runyard logs {name} 查看输出。 | Run runyard status {name} to see whether it is ready, or runyard logs {name} to read the output. | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.READY_TIMEOUT.title | 项目 {name} 等了 {seconds, plural, other {# 秒}}还没有就绪 | Playground {name} was not ready after {seconds, plural, one {# second} other {# seconds}} | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文；seconds：命令等待的秒数，非负数；文案里写复数 |
| errors.RUNTIME_MISSING.body | {tool} 运行时需要的系统组件在这台电脑上找不到。 | A system component that {tool} needs to run was not found on this computer. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译 |
| errors.RUNTIME_MISSING.hint | 补上缺少的组件后重新运行。 | Install the missing component, then run it again. | — |
| errors.RUNTIME_MISSING.hintCli | 补上缺少的组件后重新运行这条命令。 | Install the missing component, then run the command again. | — |
| errors.RUNTIME_MISSING.title | {tool} 缺少运行所需的系统组件 | A component that {tool} needs to run is missing | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译 |
| errors.RUN_FAILED.body | 进程在就绪之前就退出了。项目文件原样保留，代码可以照常编辑。 | The process exited before it was ready. The playground files are untouched and you can still edit the code. | — |
| errors.RUN_FAILED.hint | 查看完整输出找出原因，改好后重新运行。 | Read the full output to find the cause, fix it, then run it again. | — |
| errors.RUN_FAILED.hintCli | 用 runyard logs {name} 查看输出，改好后运行 runyard run {name}。 | Read the output with runyard logs {name}, fix the cause, then run runyard run {name}. | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.RUN_FAILED.title | 项目 {name} 启动失败 | Playground {name} failed to start | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.RUN_NOT_FOUND.body | 没有 ID 为 {runId} 的运行。 | There is no run with ID {runId}. | runId：用户给的运行 ID，原样显示，例如 r_8f3a |
| errors.RUN_NOT_FOUND.hint | 检查运行 ID 是否正确。 | Check that the run ID is correct. | — |
| errors.RUN_NOT_FOUND.hintCli | 运行 runyard status 查看现有的运行。 | Run runyard status to see the current runs. | — |
| errors.RUN_NOT_FOUND.title | 找不到运行 {runId} | Run {runId} not found | runId：用户给的运行 ID，原样显示，例如 r_8f3a |
| errors.SCRIPT_ERRORED.body | 脚本以非 0 的退出码结束。 | The script ended with a non-zero exit code. | — |
| errors.SCRIPT_ERRORED.hint | 查看输出找出原因，改好代码后重新运行。 | Read the output to find the cause, fix the code, then run it again. | — |
| errors.SCRIPT_ERRORED.hintCli | 用 runyard logs {name} 查看输出，改好后运行 runyard run {name}。 | Read the output with runyard logs {name}, fix the code, then run runyard run {name}. | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.SCRIPT_ERRORED.title | 脚本 {name} 运行出错 | Script {name} failed | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.SETUP_FAILED.body | 安装依赖时出错，进度停在“安装依赖”。项目文件原样保留，代码可以照常编辑。 | Something went wrong while installing dependencies, at the "Install dependencies" step. The playground files are untouched and you can still edit the code. | — |
| errors.SETUP_FAILED.hint | 查看完整输出找出原因，改好后点“重试”。 | Read the full output to find the cause, fix it, then click Retry. | — |
| errors.SETUP_FAILED.hintCli | 用 runyard logs {name} 查看安装输出，改好后运行 runyard run {name}。 | Read the install output with runyard logs {name}, fix the cause, then run runyard run {name}. | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.SETUP_FAILED.title | 项目 {name} 的依赖安装失败 | Dependency install failed for playground {name} | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.SUPERVISOR_OUTDATED.body | {runs, plural, =0 {Runyard 应用正在使用一个比当前命令行旧的后台管理进程，二者无法配合，所以没有换新。命令没有继续执行。} other {正在运行的管理进程比当前使用的 Runyard 旧，换成新版本会停掉 # 个运行。命令没有继续执行。}} | {runs, plural, =0 {The Runyard app is using an older background process that this command line cannot work with, so it was not replaced. The command did not continue.} one {The running background process is older than the Runyard you are using. Replacing it would stop # run. The command did not continue.} other {The running background process is older than the Runyard you are using. Replacing it would stop # runs. The command did not continue.}} | runs：升级管理进程会停掉的运行个数，非负整数；0 表示是桌面应用在用这个旧管理进程，没有运行；英文写复数 |
| errors.SUPERVISOR_OUTDATED.hint | 应用会先告诉你会停掉几个运行，你确认后才会更新。 | The app tells you how many runs will stop and updates only after you confirm. | — |
| errors.SUPERVISOR_OUTDATED.hintCli | {runs, plural, =0 {退出 Runyard 应用，然后重新运行这条命令。应用退出后，管理进程会自动更新。} other {运行 runyard stop --all 停止全部运行，管理进程随后会自动更新，然后重新运行这条命令。}} | {runs, plural, =0 {Quit the Runyard app, then run this command again. The background process updates itself once the app is gone.} one {Run runyard stop --all to stop every run. The background process then updates itself. After that, run the command again.} other {Run runyard stop --all to stop every run. The background process then updates itself. After that, run the command again.}} | runs：升级管理进程会停掉的运行个数，非负整数；0 表示是桌面应用在用它，不是有运行 |
| errors.SUPERVISOR_OUTDATED.title | 后台的管理进程版本较旧 | The Runyard background process is out of date | — |
| errors.SUPERVISOR_UNAVAILABLE.body | {reason, select, PATH_TOO_LONG {后台的管理进程没能启动：它的连接文件路径超过了系统允许的长度。} STARTUP_FAILED {后台的管理进程没能启动，详细原因记在管理进程日志里。} none {没能和后台的管理进程建立可信的连接。} other {没能和后台的管理进程建立可信的连接。}} | {reason, select, PATH_TOO_LONG {The background process could not start: the path of its connection file is longer than the system allows.} STARTUP_FAILED {The background process could not start. The reason is recorded in its log.} none {A trusted connection to the background process could not be established.} other {A trusted connection to the background process could not be established.}} | reason：管理进程启动失败的原因：PATH_TOO_LONG（连接文件路径超过系统上限）或 STARTUP_FAILED（其他启动失败）；可选，不知道原因时用不带原因的通用说法 |
| errors.SUPERVISOR_UNAVAILABLE.hint | {reason, select, PATH_TOO_LONG {把 Runyard 的数据目录换到更短的路径下，再重新运行。} STARTUP_FAILED {没有发送过任何请求，可以先看看管理进程日志，再重新运行。} none {没有发送过任何请求，可以直接重新运行。} other {没有发送过任何请求，可以直接重新运行。}} | {reason, select, PATH_TOO_LONG {Move the Runyard data folder to a shorter path, then run it again.} STARTUP_FAILED {No request was sent. Check the background process log, then run it again.} none {No request was sent, so you can simply run it again.} other {No request was sent, so you can simply run it again.}} | reason：管理进程启动失败的原因：PATH_TOO_LONG（连接文件路径超过系统上限）或 STARTUP_FAILED（其他启动失败）；可选，不知道原因时用不带原因的通用说法 |
| errors.SUPERVISOR_UNAVAILABLE.hintCli | {reason, select, PATH_TOO_LONG {没有发送过任何请求。换一个更短的 --root 或主目录路径，再重新运行这条命令；运行 runyard doctor 可以再确认。} STARTUP_FAILED {没有发送过任何请求。运行 runyard doctor 查看原因，详细记录在状态目录的 logs/supervisor.log，再重新运行这条命令。} none {没有发送过任何请求。运行 runyard doctor 查看原因，再重新运行这条命令。} other {没有发送过任何请求。运行 runyard doctor 查看原因，再重新运行这条命令。}} | {reason, select, PATH_TOO_LONG {No request was sent. Use a shorter --root or home folder path, then run the command again; runyard doctor can confirm.} STARTUP_FAILED {No request was sent. Run runyard doctor to find out why (details are in logs/supervisor.log in the state folder), then run the command again.} none {No request was sent. Run runyard doctor to find out why, then run the command again.} other {No request was sent. Run runyard doctor to find out why, then run the command again.}} | reason：管理进程启动失败的原因：PATH_TOO_LONG（连接文件路径超过系统上限）或 STARTUP_FAILED（其他启动失败）；可选，不知道原因时用不带原因的通用说法 |
| errors.SUPERVISOR_UNAVAILABLE.title | 连不上 Runyard 的管理进程 | Cannot connect to the Runyard background process | — |
| errors.TEMPLATE_INVALID.body | 模板文件有错误，或者是更新版本的 Runyard 写的。没有创建文件夹，模板也没有被改动。 | The template has a mistake, or it was written by a newer version of Runyard. No folder was created and the template was not changed. | — |
| errors.TEMPLATE_INVALID.hint | 修正模板，或换一个模板。 | Fix the template, or choose a different one. | — |
| errors.TEMPLATE_INVALID.hintCli | 运行 runyard template lint {template} 查看问题所在。 | Run runyard template lint {template} to see what is wrong. | template：用户给的模板标识，原样显示 |
| errors.TEMPLATE_INVALID.title | 模板「{template}」无效 | Template "{template}" is not valid | template：用户给的模板标识，原样显示 |
| errors.TEMPLATE_NOT_FOUND.body | 没有标识为这个名字的模板。 | There is no template with this ID. | — |
| errors.TEMPLATE_NOT_FOUND.hint | 检查模板标识是否拼写正确。 | Check that the template ID is spelled correctly. | — |
| errors.TEMPLATE_NOT_FOUND.hintCli | 运行 runyard template list 查看可用的模板。 | Run runyard template list to see the available templates. | — |
| errors.TEMPLATE_NOT_FOUND.title | 找不到模板「{template}」 | Template "{template}" not found | template：用户给的模板标识，原样显示 |
| errors.TEMPLATE_TEST_FAILED.body | 模板在这一步没有达到预期，例如修改文件后页面没有重新加载，或停止后仍有进程残留。除非加了 --keep-dir，临时目录会被删除。 | The template did not behave as expected in this step, for example the page did not reload after a file change, or a process was left running. The temporary folder is removed unless you passed --keep-dir. | — |
| errors.TEMPLATE_TEST_FAILED.hint | 查看这一步的结果找出原因，修好模板后再测试。 | Read the result of this step to find the cause, fix the template, then test it again. | — |
| errors.TEMPLATE_TEST_FAILED.hintCli | 修好模板后重新运行 runyard template test {template}；加 --keep-dir 可保留临时目录。 | Fix the template, then run runyard template test {template} again. Add --keep-dir to keep the temporary folder. | template：用户给的模板标识，原样显示 |
| errors.TEMPLATE_TEST_FAILED.title | 模板「{template}」的冒烟测试在 {step} 这一步失败 | Smoke test of template "{template}" failed at step {step} | template：用户给的模板标识，原样显示；step：失败的冒烟测试步骤：create、install、start、ready、reload、stop、leftovers 之一；原样显示，不翻译 |
| errors.TOOL_MISSING.body | 运行这个项目需要 {tool}（版本 {required}），但没有在这台电脑上找到它。项目已经创建，代码可以照常编辑。 | This playground needs {tool} ({required}), but it was not found on this computer. The playground is created and you can still edit the code. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译 |
| errors.TOOL_MISSING.hint | 安装 {tool} 后点“重新检测”，项目就会启动。 | Install {tool}, then click "Check again" and the playground will start. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译 |
| errors.TOOL_MISSING.hintCli | 安装 {tool}（{required}），用 runyard doctor 确认后{name, select, none {重新运行这条命令。} other {运行 runyard run {name}。}}{installCommand, select, none {} other { 安装命令（应用不会替你运行）：`{installCommand}`}}{installUrl, select, none {} other { 安装说明：{installUrl}}} | Install {tool} ({required}), check it with runyard doctor, then {name, select, none {run the command again.} other {run runyard run {name}.}}{installCommand, select, none {} other { Install command (Runyard will not run it): `{installCommand}`}}{installUrl, select, none {} other { Install instructions: {installUrl}}} | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译；name：被阻止运行的项目名称（也是文件夹名）；可选，没有时（如只检测工具）提示改为“重新运行这条命令”；installCommand：安装命令，参数用空格连成一行：模板自己写的优先，否则取工具定义里当前系统的（如 Homebrew）；可选，没有时不显示。只展示，从不运行；installUrl：安装说明或官网链接（只放 https）：模板自己写的优先，否则取工具定义里的；可选，没有时不显示 |
| errors.TOOL_MISSING.title | 没有找到 {tool} | Cannot find {tool} | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译 |
| errors.TOOL_PATH_INVALID.body | {path} 运行后没有打印出 {tool} 的版本号，所以没有采用它。原来的路径没有改。 | Running {path} did not print a {tool} version, so it was not used. The previous path is unchanged. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；path：用户指定的可执行文件的绝对路径，原样显示，不翻译 |
| errors.TOOL_PATH_INVALID.hint | 换一个文件，选 {tool} 自己的可执行文件。 | Choose the {tool} executable itself. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译 |
| errors.TOOL_PATH_INVALID.hintCli | 换一个文件，选 {tool} 自己的可执行文件。 | Choose the {tool} executable itself. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译 |
| errors.TOOL_PATH_INVALID.title | 这个文件不是可用的 {tool} | This file is not a usable {tool} | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译 |
| errors.TOOL_TOO_OLD.body | 这个项目需要 {tool} {required}，当前是 {found}。项目已经创建，代码可以照常编辑。 | This playground needs {tool} {required}, but {found} is installed. The playground is created and you can still edit the code. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译；found：本机检测到的版本，例如 20.11.0；原样显示，不翻译 |
| errors.TOOL_TOO_OLD.hint | 把 {tool} 升级到 {required} 后点“重新检测”。 | Upgrade {tool} to {required}, then click "Check again". | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译 |
| errors.TOOL_TOO_OLD.hintCli | 把 {tool} 升级到 {required}，用 runyard doctor 确认后{name, select, none {重新运行这条命令。} other {运行 runyard run {name}。}}{installCommand, select, none {} other { 安装命令（应用不会替你运行）：`{installCommand}`}}{installUrl, select, none {} other { 安装说明：{installUrl}}} | Upgrade {tool} to {required}, check it with runyard doctor, then {name, select, none {run the command again.} other {run runyard run {name}.}}{installCommand, select, none {} other { Install command (Runyard will not run it): `{installCommand}`}}{installUrl, select, none {} other { Install instructions: {installUrl}}} | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译；name：被阻止运行的项目名称（也是文件夹名）；可选，没有时（如只检测工具）提示改为“重新运行这条命令”；installCommand：安装命令，参数用空格连成一行：模板自己写的优先，否则取工具定义里当前系统的（如 Homebrew）；可选，没有时不显示。只展示，从不运行；installUrl：安装说明或官网链接（只放 https）：模板自己写的优先，否则取工具定义里的；可选，没有时不显示 |
| errors.TOOL_TOO_OLD.title | {tool} 的版本过低 | The installed {tool} is too old | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译 |
| errors.TRASH_UNAVAILABLE.body | {term_trash}现在不能用。项目文件夹没有动，也没有被永久删除。 | The {term_trash} is not available right now. The playground folder was not moved and nothing was permanently deleted. | — |
| errors.TRASH_UNAVAILABLE.hint | 项目仍在资源库里，可以稍后再试。 | The playground is still in the library. You can try again later. | — |
| errors.TRASH_UNAVAILABLE.hintCli | 项目仍在资源库里，可以稍后重新运行这条命令。 | The playground is still in the library. You can run the command again later. | — |
| errors.TRASH_UNAVAILABLE.title | 无法把项目 {name} 移到{term_trash} | Could not move playground {name} to the {term_trash} | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.USAGE.body | 这条命令的参数不完整，或写法不符合要求。 | The command is missing arguments or is not written correctly. | — |
| errors.USAGE.hint | 对照命令的帮助检查参数。 | Check the arguments against the command help. | — |
| errors.USAGE.hintCli | 在命令后加 --help 查看用法。 | Add --help to the command to see how to use it. | — |
| errors.USAGE.title | 命令用法不对 | Invalid command usage | — |
| errors.VAR_INVALID.body | 变量 {key} 不是这个模板接受的变量，或者它的值不符合要求。 | The template does not accept a variable named {key}, or its value is not valid. | key：--var 里用户给的变量名，原样显示 |
| errors.VAR_INVALID.hint | 检查变量名和值是否符合模板的要求。 | Check that the variable name and value match what the template expects. | — |
| errors.VAR_INVALID.hintCli | 修改 --var 参数后重新运行这条命令。 | Fix the --var option and run the command again. | — |
| errors.VAR_INVALID.title | 模板变量 {key} 无法使用 | Template variable {key} cannot be used | key：--var 里用户给的变量名，原样显示 |
| format.duration.days | {count, plural, other {# 天}} | {count, plural, one {# day} other {# days}} | count：整数天数 |
| format.duration.hours | {count, plural, other {# 小时}} | {count, plural, one {# hr} other {# hr}} | count：整数小时数 |
| format.duration.minutes | {count, plural, other {# 分钟}} | {count, plural, one {# min} other {# min}} | count：整数分钟数 |
| format.duration.seconds | {count, plural, other {# 秒}} | {count, plural, one {# sec} other {# sec}} | count：整数秒数 |
| format.relative.days | {count, plural, other {# 天前}} | {count, plural, one {# day ago} other {# days ago}} | count：距现在的整数天数，至少为 1 |
| format.relative.hours | {count, plural, other {# 小时前}} | {count, plural, one {# hr ago} other {# hr ago}} | count：距现在的整数小时数，1 到 23 |
| format.relative.justNow | 刚刚 | just now | — |
| format.relative.minutes | {count, plural, other {# 分钟前}} | {count, plural, one {# min ago} other {# min ago}} | count：距现在的整数分钟数，1 到 59 |
| library.action.dismiss.action | 知道了 | Got it | — |
| library.action.failed.title | 操作没有完成 | That did not finish | — |
| library.autoClean.dialog.title | 自动清理 | Auto-clean | — |
| library.clean.keep.action | 改为保留 | Keep them | — |
| library.clean.later.action | 稍后再说 | Remind me later | — |
| library.clean.now.action | 现在清理 | Clean now | — |
| library.cleanBanner.end.label | 。 | . | — |
| library.cleanBanner.idle.label | {days, plural, =0 {（今天打开过）} other {（已 # 天没打开）}} | {days, plural, =0 {(opened today)} one {(not opened for # day)} other {(not opened for # days)}} | days：已经几天没打开 |
| library.cleanBanner.lead.label | {count, plural, other {# 个项目}}明天会被自动清理： | {count, plural, one {# playground} other {# playgrounds}} will be cleaned up tomorrow: | count：明天会被自动清理的项目数 |
| library.cleanBanner.region.aria | 自动清理提醒 | Auto-clean reminder | — |
| library.cleanBanner.separator.label | ； | ; | — |
| library.column.actions.aria | 操作 | Actions | — |
| library.column.creator.label | 创建者 | Created by | — |
| library.column.lastOpened.label | 上次打开 | Last opened | — |
| library.column.name.label | 名称与备注 | Name and note | — |
| library.column.port.label | 端口 | Port | — |
| library.column.retention.label | 保留 | Retention | — |
| library.column.status.label | 状态 | Status | — |
| library.column.template.label | 模板 | Template | — |
| library.creator.agent.label | 智能体 | Agent | — |
| library.creator.cli.label | 命令行 | Command line | — |
| library.creator.collapse.aria | 收起创建信息 | Hide creation details | — |
| library.creator.details.label | 由 <user>{agent}</user> 创建 · {time}{hasCommand, select, yes { · 命令：<code>{command}</code>} other {}} | Created by <user>{agent}</user> · {time}{hasCommand, select, yes { · Command: <code>{command}</code>} other {}} | time：创建时间（已格式化）；hasCommand：有创建命令是 yes，否则 no；command：创建时的命令行（用 code 标签包成等宽）；user：包住智能体名称的标签；code：包住命令的标签，显示成等宽字体；agent：智能体名称（不翻译） |
| library.creator.expand.aria | 展开创建信息 | Show creation details | — |
| library.creator.me.label | 我 | Me | — |
| library.creator.tooltip.label | {time} 创建{hasCommand, select, yes { · 命令：{command}} other {}} | Created {time}{hasCommand, select, yes { · Command: {command}} other {}} | time：创建时间（已格式化）；hasCommand：有创建命令是 yes，否则 no；command：创建时的命令行（用 code 标签包成等宽） |
| library.empty.cli.label | 也可以让智能体用命令行创建： | Or let an agent create one from the command line: | — |
| library.empty.hint | 选一个模板，新建你的第一个项目。 | Pick a template to create your first playground. | — |
| library.empty.title | 还没有项目 | No playgrounds yet | — |
| library.filter.agent.label | 智能体创建 | Created by agents | — |
| library.filter.all.label | 全部 | All | — |
| library.filter.autoClean.label | 自动清理 | Auto-clean | — |
| library.filter.combined.label | 筛选 | Filter | — |
| library.filter.kept.label | 已保留 | Kept | — |
| library.filter.sort.label | 排序：{value} | Sort: {value} | value：当前选中的排序名 |
| library.filter.status.label | 状态：{value} | Status: {value} | value：当前选中的状态名 |
| library.filter.type.label | 类型：{value} | Type: {value} | value：当前选中的类型名 |
| library.menu.sort.aria | 排序方式 | Sort order | — |
| library.menu.status.aria | 按状态筛选 | Filter by status | — |
| library.menu.type.aria | 按类型筛选 | Filter by type | — |
| library.missing.body | <mono>{path}</mono> 不在原来的位置了。可能被移动、改名或删除。 | <mono>{path}</mono> is no longer where it was. It may have been moved, renamed or deleted. | path：项目原来的文件夹路径（主目录缩成 ~）；mono：包住路径的标签，显示成等宽字体 |
| library.missing.mismatch.label | 这个文件夹不是 <user>{name}</user> | This folder is not <user>{name}</user> | name：这个项目的名称（用户自己起的，不翻译）；user：包住用户内容的标签 |
| library.missing.revealParent.action | 在{term_fileManager}中显示上一级文件夹 | Show the parent folder in {term_fileManager} | — |
| library.missing.status.label | 找不到文件夹 | Folder not found | — |
| library.nav.aria | 资源库导航 | Library navigation | — |
| library.nav.library.title | 资源库 | Library | — |
| library.nav.manage.title | 管理 | Manage | — |
| library.nav.settings.label | 设置 | Settings | — |
| library.nav.templates.label | 模板 | Templates | — |
| library.nav.unused.label | 长期未使用 | Unused for a while | — |
| library.noResults.clear.action | 清除搜索 | Clear search | — |
| library.noResults.create.action | 新建项目，名称用“{query}” | New playground named “{query}” | query：用户输入的搜索文字，同时是新项目的名称 |
| library.noResults.filtered.hint | 换一个筛选条件试试。 | Try different filters. | — |
| library.noResults.filtered.title | 没有符合条件的项目 | No playgrounds match | — |
| library.noResults.hint | 名称、备注和模板里都没有这个词。 | No name, note, or template contains this word. | — |
| library.noResults.reset.action | 清除筛选 | Clear filters | — |
| library.noResults.title | 没有找到“{query}” | No results for “{query}” | query：用户输入的搜索文字（原样，不翻译） |
| library.note.dialog.title | 编辑备注 | Edit note | — |
| library.note.empty.label | 未填写备注 | No note | — |
| library.page.results.label | {count, plural, other {# 个结果}} · 共 {total, plural, other {# 个项目}} · 存放在 {root} | {count, plural, one {# result} other {# results}} · {total, plural, one {# playground} other {# playgrounds}} · stored in {root} | count：搜索和筛选后剩下的项目数；total：资源库里项目的总数；root：资源库根目录（主目录缩成 ~） |
| library.page.summary.label | {total, plural, other {# 个项目}} · {running, plural, other {# 个正在运行}} · 存放在 {root} | {total, plural, one {# playground} other {# playgrounds}} · {running, plural, one {# running} other {# running}} · stored in {root} | total：资源库里项目的总数；running：正在运行的项目数；root：资源库根目录（主目录缩成 ~） |
| library.rename.dialog.title | 重命名 | Rename | — |
| library.rename.nameFolder.hint | 名称同时是文件夹名；改名后旧的 runyard://open 链接会失效。 | The name is also the folder name; renaming breaks old runyard://open links. | — |
| library.rename.nameRunning.hint | 名称同时是文件夹名；这个项目正在运行，保存后会停止并用新名称重新启动；旧的 runyard://open 链接会失效。 | The name is also the folder name. This playground is running: saving stops it and restarts it under the new name. Old runyard://open links will stop working. | — |
| library.rename.save.action | 保存 | Save | — |
| library.rename.terminalClose.hint | 这个项目的终端会被关闭。 | This playground's terminal will be closed. | — |
| library.rename.terminalCommand.hint | 终端里正在运行的 {command} 会被结束。 | The {command} running in the terminal will be ended. | command：终端里正在运行的命令名（程序名，不翻译） |
| library.retention.autoClean.label | 剩 {days, plural, other {# 天}} | {days, plural, one {# day} other {# days}} left | days：距离自动清理还剩的天数 |
| library.retention.autoClean.tooltip | {days, plural, other {# 天}}没打开就移到{term_trash}，每次打开重新计时 | Moved to the {term_trash} after {days, plural, one {# day} other {# days}} unopened; the count restarts on every open | days：自动清理设定的天数 |
| library.retention.kept.label | 已保留 | Kept | — |
| library.retention.tomorrow.label | 明天清理 | Tomorrow | — |
| library.row.autoClean.action | 自动清理… | Auto-clean… | — |
| library.row.autoCleanNow.hint | 现在：{state} | Now: {state} | state：当前保留状态的文字（已保留，或剩 N 天） |
| library.row.copyLink.action | 复制链接 | Copy link | — |
| library.row.copyPath.action | 复制路径 | Copy path | — |
| library.row.duplicate.action | 创建副本 | Duplicate | — |
| library.row.editNote.action | 编辑备注… | Edit note… | — |
| library.row.forget.action | 从资源库移除 | Remove from library | — |
| library.row.more.aria | {name} 的更多操作 | More actions for {name} | name：项目名（用户自己起的，不翻译） |
| library.row.open.action | 打开 | Open | — |
| library.row.openHint.label | 回车 | Enter | — |
| library.row.openInEditor.action | 在外部编辑器中打开 | Open in external editor | — |
| library.row.openOnly.action | 打开但不运行 | Open without running | — |
| library.row.openTerminal.action | 在终端中打开 | Open in Terminal | — |
| library.row.relocate.action | 重新定位… | Locate… | — |
| library.row.rename.action | 重命名… | Rename… | — |
| library.row.renameBusy.hint | 安装或启动完成后才能改名 | Available once install or start finishes | — |
| library.row.reveal.action | 在{term_fileManager}中显示 | Show in {term_fileManager} | — |
| library.row.saveAsTemplate.action | 另存为模板… | Save as template… | — |
| library.row.stop.action | 停止运行 | Stop | — |
| library.row.trash.action | 移到{term_trash} | Move to {term_trash} | — |
| library.search.clear.aria | 清除搜索 | Clear search | — |
| library.search.expand.aria | 展开搜索 | Expand search | — |
| library.search.key.label | {term_searchShortcut} | {term_searchShortcut} | — |
| library.search.label | 搜索项目 | Search playgrounds | — |
| library.search.placeholder | 搜索名称、备注、模板 | Search name, note, template | — |
| library.search.short.placeholder | 搜索 | Search | — |
| library.sidebar.collapse.label | 收起侧栏 | Hide sidebar | — |
| library.sidebar.expand.label | 显示侧栏 | Show sidebar | — |
| library.sidebar.footer.label | {count, plural, other {# 个项目}} | {count, plural, one {# playground} other {# playgrounds}} | count：资源库里项目的总数 |
| library.sort.created.label | 创建时间 | Created | — |
| library.sort.name.label | 名称 | Name | — |
| library.sort.recent.label | 最近打开 | Recently opened | — |
| library.status.problem.label | 有问题 | Has a problem | — |
| library.status.running.label | 运行中 | Running | — |
| library.status.stopped.label | 已停止 | Stopped | — |
| library.tab.title | 资源库 | Library | — |
| library.table.aria | 项目列表 | Playgrounds | — |
| library.topbar.idle.label | 没有在运行的项目 | No playground running | — |
| library.topbar.running.label | {count, plural, other {# 个运行中}} | {count, plural, one {# running} other {# running}} | count：正在运行的项目数（标签页和命令行持有的都算） |
| library.trash.body | 文件夹会移到{term_trash}，可以在{term_trash}里恢复。{running, select, yes {它正在运行，会先停止运行。} other {它现在没有在运行。}}{terminalCommand, select, none {} other {终端里还在运行 {terminalCommand}，会被结束。}} | The folder moves to the {term_trash}, where you can restore it. {running, select, yes {It is running and will be stopped first.} other {It is not running right now.}}{terminalCommand, select, none {} other { {terminalCommand} is still running in the terminal and will be ended.}} | running：项目现在是否在运行：yes 或 no；terminalCommand：终端里正在运行的命令名（程序名，不翻译）；终端空闲或没开时是 none |
| library.trash.cancel.action | 取消 | Cancel | — |
| library.trash.confirm.action | 移到{term_trash} | Move to {term_trash} | — |
| library.trash.title | 把 {name} 移到{term_trash}？ | Move {name} to the {term_trash}? | name：项目名（用户自己起的，不翻译） |
| notice.DEPS_FROM_CACHE | 依赖来自本机缓存。 | Dependencies came from the local cache. | — |
| notice.ENV_DEGRADED | 只读到了非交互的终端环境，工具检测的结果可能不准。 | Only the non-interactive terminal environment could be read, so tool detection may be inaccurate. | — |
| notice.ENV_UNRESOLVED | 没能读取你终端的环境（{reason, select, timeout {读取超时} other {读取失败}}），工具检测的结果可能不准。先用常用目录的扫描结果，后台会再试一次。 | Could not read your terminal environment ({reason, select, timeout {timed out} other {failed}}), so tool detection may be inaccurate. Runyard is using a scan of common directories for now and will try again in the background. | reason：读取失败的原因：timeout（超时）或 failed（失败）；用 select 选词 |
| notice.IDLE_STOPPED | 空闲 {minutes, plural, other {# 分钟}}，已自动停止。 | Stopped automatically after being idle for {minutes, plural, one {# minute} other {# minutes}}. | minutes：空闲分钟数，正整数；文案里写复数 |
| notice.PACKAGE_MANAGER_FALLBACK | 没有找到 {wanted}，已改用 {used}。 | {wanted} was not found, so {used} is used instead. | wanted：首选的包管理器名，例如 pnpm；原样显示；used：实际改用的包管理器名，例如 npm；原样显示 |
| notice.PATH_NEAR_LIMIT | 项目路径有 {length, plural, other {# 个字符}}，接近系统允许的上限（{limit, number} 个字符）。创建照常进行；缩短名称或换一个更短的资源库位置可以避开这个问题。 | The playground path is {length, plural, one {# character} other {# characters}} long, close to the system limit of {limit, number}. Creation continues. A shorter name or a shorter library location avoids the problem. | length：项目路径的字符数，正整数；文案里写复数；limit：当前系统的路径长度上限（字符数），由平台层给出；原样显示 |
| notice.PORT_FALLBACK | {wanted} 端口{reason, select, PORT_RESERVED {被系统保留} other {被占用}}，本次改用 {actual} 端口。下次启动仍会先试 {wanted} 端口。 | Port {wanted} is {reason, select, PORT_RESERVED {reserved by the system} other {in use}}, so this run uses port {actual}. The next run tries {wanted} first. | wanted：项目登记的端口号，例如 7101；原样显示，不加千分位；reason：回退原因：PORT_OCCUPIED（被占用）或 PORT_RESERVED（被系统保留）；用 select 选词；actual：本次实际使用的端口号；原样显示，不加千分位 |
| notice.PORT_NOT_RELEASED | 停止后 {port} 端口等了 {waitedMs, plural, other {# 毫秒}}（上限 {limitMs, plural, other {# 毫秒}}）仍没有释放。下次启动时如果它还被占用，这个项目那一次会改用另一个端口，登记的端口不变。 | Port {port} was not released within {limitMs, plural, one {# millisecond} other {# milliseconds}} of the stop (waited {waitedMs, plural, one {# millisecond} other {# milliseconds}}). If it is still in use at the next start, the playground uses another port for that run; its registered port does not change. | port：停止的那次运行用的端口号；原样显示，不加千分位；waitedMs：停止后实际等了多少毫秒，非负整数；文案里写复数；limitMs：等待的上限（毫秒），正整数，现在是 3000；文案里写复数 |
| notice.PROCESS_EXITED | 进程已退出{exitCode, select, none {} other {，退出码 {exitCode}}}{signal, select, none {} other {，信号 {signal}}}。 | The process exited{exitCode, select, none {} other { with code {exitCode}}}{signal, select, none {} other { (signal {signal})}}. | exitCode：进程的退出码（整数），可选；没传时翻译函数自动传 none，文案用 select 的 none 分支；signal：终止进程的信号名，例如 SIGKILL，可选；原样显示，不翻译；没传时同上 |
| notice.RELOADING | 文件有改动，正在重载。 | Files changed, reloading. | — |
| notice.STOPPED_BY_USER | 你停止了这个项目。 | You stopped this playground. | — |
| notice.SUPERVISOR_IN_USE_BY_APP | Runyard 应用正在使用后台的管理进程，它和这个命令行不是同一个构建，所以没有换新，本次命令继续使用它。退出应用后，下一条命令会把它更新。 | The Runyard app is using the background process, which is a different build from this command line, so it was not replaced. This command continues with it. After you quit the app, the next command updates it. | — |
| notice.TOOL_VERSION_UNTESTED | {tool} {found} 高于这个模板测试过的范围（{required}）。照常运行，但没有经过测试。 | {tool} {found} is newer than the range this template was tested with ({required}). It runs as usual but is untested. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；found：本机检测到的版本，例如 20.11.0；原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译 |
| platform.clearShortcut | {platform, select, other {⌘K}} | {platform, select, other {⌘K}} | — |
| platform.copyShortcut | {platform, select, other {⌘C}} | {platform, select, other {⌘C}} | — |
| platform.fileManager | {platform, select, other {访达}} | {platform, select, other {Finder}} | — |
| platform.pasteShortcut | {platform, select, other {⌘V}} | {platform, select, other {⌘V}} | — |
| platform.searchShortcut | {platform, select, other {⌘F}} | {platform, select, other {⌘F}} | — |
| platform.selectAllShortcut | {platform, select, other {⌘A}} | {platform, select, other {⌘A}} | — |
| platform.trash | {platform, select, other {废纸篓}} | {platform, select, other {Trash}} | — |
| runState.checking | 检查工具 | Checking tools | — |
| runState.crashed | 已崩溃 | Crashed | — |
| runState.errored | 已出错 | Failed | — |
| runState.failed | 启动失败 | Failed to start | — |
| runState.finished | 已结束 | Finished | — |
| runState.installing | 安装依赖 | Installing dependencies | — |
| runState.ready | 就绪 | Ready | — |
| runState.reloading | 重新启动中 | Restarting | — |
| runState.running | 运行中 | Running | — |
| runState.starting | 启动中 | Starting | — |
| runState.stopped | 已停止 | Stopped | — |
| runState.stopping | 停止中 | Stopping | — |
| settings.autoSave.blur.label | 失去焦点时 | On focus loss | — |
| settings.autoSave.delay.label | 延迟 1 秒后 | After 1 s | — |
| settings.autoSave.hint | 编辑时自动保存修改 | Save changes as you type | — |
| settings.autoSave.off.label | 关闭 | Off | — |
| settings.autoSave.title | 自动保存 | Autosave | — |
| settings.builtinSkip.hint | 默认每次都确认。打开后，链接要新建的是内置模板时不再询问 | Asks every time by default. When on, links that create a built-in template no longer ask | — |
| settings.builtinSkip.title | 来自链接的新建请求：内置模板免确认 | New-playground links: skip the prompt for built-in templates | — |
| settings.cli.available.label | 可用 · {version} | Available · {version} | version：命令行的版本，与应用相同，如 0.1.0；原样显示 |
| settings.cli.command.title | runyard 命令 | runyard command | — |
| settings.cli.conflict.hint | 那个位置已经有别的文件，没有动它 | Another file is already at that path. It was left untouched. | — |
| settings.cli.conflict.label | 位置被占用 | Path in use | — |
| settings.cli.copyCommand.action | 复制命令 | Copy command | — |
| settings.cli.diagnostics.action | 导出诊断信息… | Export diagnostics… | — |
| settings.cli.diagnostics.title | 诊断信息 | Diagnostics | — |
| settings.cli.exportDone.label | 已导出 | Exported | — |
| settings.cli.exportFailed.label | 导出失败 | Export failed | — |
| settings.cli.failed.body | 没能完成，请重试 | That didn't work. Try again. | — |
| settings.cli.install.action | 安装命令行工具 | Install command-line tool | — |
| settings.cli.missing.label | 未安装 | Not installed | — |
| settings.cli.notOnPath.body | {dir} 不在 PATH 上。把下面这行加进你的 shell 配置，再重新打开终端： | {dir} is not on your PATH. Add this line to your shell profile, then reopen the terminal: | dir：链接所在目录，主目录缩成 ~，如 ~/.local/bin；原样显示 |
| settings.cli.remove.action | 移除 | Remove | — |
| settings.cli.stale.label | 指向旧位置 | Linked to an old location | — |
| settings.cli.title | 命令行与智能体 | Command line and agents | — |
| settings.cli.unavailable.hint | 从源码运行时没有随包的命令行 | The command line is bundled with the installed app only | — |
| settings.cli.unavailable.label | 仅安装版可用 | Installed app only | — |
| settings.confirmClose.hint | 关闭标签页会停止项目；关掉这个开关后直接关闭并停止 | Closing a tab stops the playground; with this off, tabs close and stop right away | — |
| settings.confirmClose.title | 关闭运行中的标签页前询问 | Ask before closing a running tab | — |
| settings.deps.title | 依赖与网络 | Dependencies and network | — |
| settings.dialog.cancel.action | 取消 | Cancel | — |
| settings.editRun.title | 编辑与运行 | Editing and running | — |
| settings.editor.cursor.label | Cursor | Cursor | — |
| settings.editor.default.label | 系统默认 | System default | — |
| settings.editor.hint | 用它打开项目文件夹 | Opens the playground folder | — |
| settings.editor.sublime.label | Sublime Text | Sublime Text | — |
| settings.editor.title | 外部编辑器 | External editor | — |
| settings.editor.vscode.label | VS Code | VS Code | — |
| settings.editor.webstorm.label | WebStorm | WebStorm | — |
| settings.editor.zed.label | Zed | Zed | — |
| settings.general.title | 通用 | General | — |
| settings.idleStop.hint | 没有请求、也没有输出的时间 | Time with no requests and no output | — |
| settings.idleStop.hour2.label | 2 小时 | 2 hr | — |
| settings.idleStop.min15.label | 15 分钟 | 15 min | — |
| settings.idleStop.min30.label | 30 分钟 | 30 min | — |
| settings.idleStop.title | 命令行启动的项目，空闲后自动停止 | Stop CLI-started playgrounds when idle | — |
| settings.language.en.label | English | English | — |
| settings.language.hint | 立即生效 | Applies immediately | — |
| settings.language.title | 语言 | Language | — |
| settings.language.zhCN.label | 简体中文 | Simplified Chinese | — |
| settings.libraryRoot.change.action | 更改… | Change… | — |
| settings.libraryRoot.confirm.body | 旧位置里的项目留在原处，不会被移动或删除，也不再出现在列表里。新位置里已有的项目会列出来。 | Playgrounds in the old location stay where they are. They are not moved or deleted, and no longer appear in the list. Playgrounds already in the new location are listed. | — |
| settings.libraryRoot.confirm.title | 把资源库换到 {path}？ | Move the library to {path}? | path：新位置，主目录缩成 ~；用户选的，不翻译 |
| settings.libraryRoot.continue.action | 继续 | Continue | — |
| settings.libraryRoot.move.action | 更改位置 | Change location | — |
| settings.libraryRoot.protected.body | macOS 在第一次访问“桌面”“文档”“下载”里的文件时，会弹出系统的隐私权限提示。继续的话，之后可能会看到这个提示。 | macOS shows a system privacy prompt the first time an app reads files in Desktop, Documents or Downloads. If you continue, you may see that prompt. | — |
| settings.libraryRoot.protected.title | 把资源库放在“桌面”“文档”或“下载”里？ | Put the library in Desktop, Documents or Downloads? | — |
| settings.libraryRoot.reveal.action | 在{term_fileManager}中显示 | Show in {term_fileManager} | — |
| settings.libraryRoot.title | 资源库位置 | Library location | — |
| settings.noProxyLocal.title | 检测本机服务时不走代理 | Bypass the proxy when checking local services | — |
| settings.page.aria | 设置 | Settings | — |
| settings.page.title | 设置 | Settings | — |
| settings.pm.auto.label | 自动 | Auto | — |
| settings.pm.hint | 安装依赖时使用 | Used to install dependencies | — |
| settings.pm.npm.label | npm | npm | — |
| settings.pm.pnpm.label | pnpm | pnpm | — |
| settings.pm.title | 包管理器 | Package manager | — |
| settings.proxy.example.placeholder | http://127.0.0.1:7890 | http://127.0.0.1:7890 | — |
| settings.proxy.hint | 访问网络时使用 | Used for network requests | — |
| settings.proxy.inherited.hint | 正在沿用本机的配置 | Using your local setup | — |
| settings.proxy.invalid.body | 地址不合法，例如 http://127.0.0.1:7890 | Not a valid address, for example http://127.0.0.1:7890 | — |
| settings.proxy.title | 代理 | Proxy | — |
| settings.registry.example.placeholder | https://registry.npmjs.org | https://registry.npmjs.org | — |
| settings.registry.hint | 默认沿用本机 .npmrc 的配置 | Defaults to your local .npmrc | — |
| settings.registry.inherited.hint | 正在沿用本机 .npmrc 的配置 | Using your local .npmrc | — |
| settings.registry.invalid.body | 地址不合法，要以 http:// 或 https:// 开头 | Not a valid address. Start with http:// or https:// | — |
| settings.registry.title | npm 镜像源 | npm registry | — |
| settings.runNote.label | 在应用里打开标签页即运行，关闭标签页即停止；命令行启动的不受影响，空闲后自动停止。 | Opening a tab in the app runs the playground and closing the tab stops it. Runs started from the CLI are not affected and stop automatically when idle. | — |
| settings.runtime.absolutePath.body | 请输入完整绝对路径，不使用 ~ 或环境变量 | Enter an absolute path without ~ or environment variables | — |
| settings.runtime.and.label | 且 | and | — |
| settings.runtime.arch.label | 芯片架构 | Chip | — |
| settings.runtime.choosePath.aria | 选择 {tool} 可执行文件 | Choose {tool} executable | tool：工具显示名称，如 Node |
| settings.runtime.command.label | 安装命令 | Command | — |
| settings.runtime.copy.action | 复制命令 | Copy command | — |
| settings.runtime.current.label | 当前 | Current | — |
| settings.runtime.envFailed.body | 没能读取你终端的环境，可能不准 | Couldn't read your terminal's environment, so these results may be off | — |
| settings.runtime.found.label | 已找到 | Found | — |
| settings.runtime.installed.label | 已经装了？ | Already installed? | — |
| settings.runtime.invalidPath.body | 这个文件不是可用的 {tool}，原来的路径没有改 | That file isn't a usable {tool}. The previous path is unchanged. | tool：工具名，如 Node、Go、pnpm；专有名词，原样显示，不翻译 |
| settings.runtime.missing.label | 未安装 | Not installed | — |
| settings.runtime.missing.title | 没有找到 {tool} | {tool} not found | tool：工具名，如 Node、Go、pnpm；专有名词，原样显示，不翻译 |
| settings.runtime.need.label | 需要 | Required | — |
| settings.runtime.note.label | 只有创建或打开项目时才会检查它需要的工具。Runyard 不会替你安装。 | Runyard only checks for the tools a playground needs when you create or open it. It never installs anything for you. | — |
| settings.runtime.path.label | 路径 | Path | — |
| settings.runtime.pathFailed.body | 没能指定这个路径 | Couldn't set that path | — |
| settings.runtime.pathInput.aria | {tool} 可执行文件路径 | {tool} executable path | tool：工具显示名称，如 Node |
| settings.runtime.pathInput.hint | 输入完整路径后按回车保存，Esc 撤销 | Press Enter to save the full path; Esc to cancel | — |
| settings.runtime.pathInput.placeholder | 输入完整可执行文件路径 | Enter the full executable path | — |
| settings.runtime.recheck.action | 重新检测 | Check again | — |
| settings.runtime.runInstall.action | 在终端中运行 | Run in Terminal | — |
| settings.runtime.setPath.action | 指定路径… | Set path… | — |
| settings.runtime.site.label | 官网 | Website | — |
| settings.runtime.status.label | 状态 | Status | — |
| settings.runtime.table.aria | 运行环境 | Runtime | — |
| settings.runtime.title | 运行环境 | Runtime | — |
| settings.runtime.tooOld.label | 版本过低 | Too old | — |
| settings.runtime.tooOld.title | {tool} 的版本过低 | {tool} is too old | tool：工具名，如 Node、Go、pnpm；专有名词，原样显示，不翻译 |
| settings.runtime.tool.label | 工具 | Tool | — |
| settings.runtime.toolName.label | {tool} | {tool} | tool：工具名，如 Node、Go、pnpm；专有名词，原样显示，不翻译 |
| settings.runtime.unknown.label | 检测中 | Checking | — |
| settings.runtime.version.label | 版本 | Version | — |
| settings.scriptAutoRun.hint | Node、Python、Go 脚本保存后自动重新运行 | Node, Python and Go scripts run again automatically when saved | — |
| settings.scriptAutoRun.title | 脚本保存后自动运行 | Run scripts on save | — |
| settings.skills.agents.label | 已安装到 Codex | Installed for Codex | — |
| settings.skills.agentsName.label | Codex | Codex | — |
| settings.skills.both.label | 已安装到 Claude Code 和 Codex | Installed for Claude Code and Codex | — |
| settings.skills.claude.label | 已安装到 Claude Code | Installed for Claude Code | — |
| settings.skills.claudeName.label | Claude Code | Claude Code | — |
| settings.skills.hint | 让 Claude Code、Codex 等知道怎么用 runyard 新建和运行项目 | Lets Claude Code, Codex and others create and run playgrounds | — |
| settings.skills.none.label | 未安装 | Not installed | — |
| settings.skills.other.action | 安装到其他智能体… | Install for another agent… | — |
| settings.skills.title | 智能体技能包 | Agent skill | — |
| settings.supervisor.confirm.body | 这会停止全部运行：{cli, plural, other {# 个由命令行启动}}，{tab, plural, other {# 个在标签页里运行}}；然后让管理进程退出。应用需要时会再启动一个新的。 | This stops every run: {cli, plural, one {# started from the CLI} other {# started from the CLI}} and {tab, plural, one {# running in a tab} other {# running in tabs}}. Then the supervisor quits; the app starts a new one when it needs it. | cli：命令行持有的运行个数；tab：标签页持有的运行个数 |
| settings.supervisor.confirm.title | 停止后台管理进程？ | Stop the background supervisor? | — |
| settings.supervisor.hint | 照看所有运行；应用退出后继续照看命令行启动的项目 | Looks after every run; keeps CLI-started playgrounds going after the app quits | — |
| settings.supervisor.running.label | {count, plural, =0 {运行中} other {运行中 · # 个由命令行启动}} | {count, plural, =0 {Running} one {Running · # started from the CLI} other {Running · # started from the CLI}} | count：命令行持有的运行个数 |
| settings.supervisor.stop.action | 停止 | Stop | — |
| settings.supervisor.stopped.label | 未运行 | Not running | — |
| settings.supervisor.title | 后台管理进程 | Background supervisor | — |
| settings.theme.dark.label | 深色 | Dark | — |
| settings.theme.hint | 浅色、深色或跟随系统 | Light, dark, or match the system | — |
| settings.theme.light.label | 浅色 | Light | — |
| settings.theme.system.label | 跟随系统 | System | — |
| settings.theme.title | 主题 | Theme | — |
| settings.updateCheck.hint | 每天一次，只访问 GitHub 的公开发布页，不发送任何标识 | Once a day, reads the public GitHub releases page only and sends no identifier | — |
| settings.updateCheck.title | 自动检查更新 | Check for updates automatically | — |
| workspace.attached.adopt.action | 改为由我管理 | Manage it myself | — |
| workspace.attached.aria | 命令行启动的运行 | Run started from the command line | — |
| workspace.attached.hint | 改为由我管理后，关闭标签页就会停止它。不改的话，它空闲一段时间后会自动停止。 | Once you manage it, closing the tab stops it. Otherwise it stops by itself after a while idle. | — |
| workspace.attached.stop.action | 停止 | Stop | — |
| workspace.attached.title | {agent} 通过命令行启动 · {ago} | Started from the command line by {agent} · {ago} | agent：智能体的名称，来自命令行的启动记录，原样显示；ago：相对时间，如“31 分钟前”，由格式化函数生成 |
| workspace.attached.titlePlain.label | 通过命令行启动 · {ago} | Started from the command line · {ago} | ago：相对时间，如“31 分钟前”，由格式化函数生成 |
| workspace.closeConfirm.body | 关闭标签页会停止这个项目。代码和文件不受影响，下次打开会重新运行。 | Closing the tab stops this playground. Your code and files are not affected, and it runs again the next time you open it. | — |
| workspace.closeConfirm.cancel.action | 取消 | Cancel | — |
| workspace.closeConfirm.close.action | 关闭 | Close | — |
| workspace.closeConfirm.confirm.action | 关闭并停止 | Close and stop | — |
| workspace.closeConfirm.optOut.hint | 以后关闭标签页直接停止。可以在“设置 › 编辑与运行”里重新打开提示。 | Tabs will then close and stop right away. You can turn the prompt back on in Settings › Editing and running. | — |
| workspace.closeConfirm.optOut.label | 不再提示 | Don’t ask again | — |
| workspace.closeConfirm.terminal.body | {stopsRun, select, yes {关闭标签页会停止这个项目，终端里还在运行 {command}，也会被结束。代码和文件不受影响，下次打开会重新运行。} other {终端里还在运行 {command}，关闭会结束它。}} | {stopsRun, select, yes {Closing the tab stops this playground, and {command} still running in the terminal will end too. Your code and files are not affected; it runs again the next time you open it.} other {{command} is still running in the terminal. Closing will end it.}} | stopsRun：yes 表示关闭还会停止运行，other 表示只结束终端里的命令；command：终端里正在运行的命令名，不翻译 |
| workspace.closeConfirm.terminal.title | 关闭 {name}？ | Close {name}? | name：项目名，用户自己起的，不翻译 |
| workspace.closeConfirm.title | 关闭 {name} 并停止运行？ | Close {name} and stop it? | name：项目名，用户自己起的，不翻译 |
| workspace.duration.hoursMinutes.label | {hours} {minutes} | {hours} {minutes} | hours：小时数，如“2 小时”；minutes：分钟数，如“14 分钟” |
| workspace.files.add.aria | 在项目根新建 | New at the playground root | — |
| workspace.files.collapse.label | 收起文件树 | Hide file tree | — |
| workspace.files.create.aria | 新文件或文件夹的名称 | Name of the new file or folder | — |
| workspace.files.empty.hint | 这个项目里还没有文件 | There are no files in this playground yet | — |
| workspace.files.expand.label | 展开文件树 | Show file tree | — |
| workspace.files.failed.hint | 文件操作没有成功，请再试一次 | The file action didn’t work. Please try again | — |
| workspace.files.menu.aria | 文件树的操作 | File tree actions | — |
| workspace.files.nameExists.hint | 已经有一个叫 {name} 的文件或文件夹 | A file or folder named {name} already exists | name：已存在的名字 |
| workspace.files.nameInvalid.hint | {reason, select, empty {名字不能是空的} separator {名字里不能有斜杠} dot {名字不能是“.”或“..”} control {名字里不能有控制字符} other {名字太长了}} | {reason, select, empty {The name can’t be empty} separator {The name can’t contain a slash} dot {The name can’t be . or ..} control {The name can’t contain control characters} other {The name is too long}} | reason：名字不可用的原因：empty 空、separator 含斜杠、dot 是 . 或 ..、control 含控制字符、too-long 太长 |
| workspace.files.newFile.action | 新建文件 | New file | — |
| workspace.files.newFolder.action | 新建文件夹 | New folder | — |
| workspace.files.notFound.hint | {name} 已经不在了 | {name} is no longer there | name：文件或文件夹的名字（不含路径） |
| workspace.files.notice.aria | 文件操作的结果 | Result of the file action | — |
| workspace.files.outside.hint | 这个位置在项目文件夹之外，不能操作 | That location is outside the playground folder | — |
| workspace.files.rename.aria | 新名称 | New name | — |
| workspace.files.renameItem.action | 重命名 | Rename | — |
| workspace.files.renameItem.hint | F2 | F2 | — |
| workspace.files.saveFailed.hint | 没能写入 {name}：{reason, select, readOnly {它是只读的} permission {没有权限} other {写入出错了}} | Couldn’t write {name}: {reason, select, readOnly {it is read-only} permission {permission denied} other {the write failed}} | name：文件的名字（不含路径）；reason：写入失败的原因：readOnly 只读、permission 没有权限、other 其他 |
| workspace.files.title.label | 文件 | Files | — |
| workspace.files.trashFailed.hint | 没能把 {name} 移到{term_trash}，它还在原处，没有被删除 | Couldn’t move {name} to the {term_trash}. It is still in place and was not deleted | name：文件或文件夹的名字（不含路径） |
| workspace.files.trashItem.action | 移到{term_trash} | Move to {term_trash} | — |
| workspace.files.trashed.hint | 已移到{term_trash} | Moved to {term_trash} | — |
| workspace.files.tree.aria | 文件树 | File tree | — |
| workspace.resize.console.label | 调整输出面板高度 | Resize output panel | — |
| workspace.resize.hint | 拖动调整大小，双击恢复默认 | Drag to resize, double-click to reset | — |
| workspace.resize.preview.label | 调整预览宽度 | Resize preview | — |
| workspace.resize.tree.label | 调整文件树宽度 | Resize file tree | — |
| workspace.running.aria | 运行中的项目 | Running playgrounds | — |
| workspace.running.footer.hint | 标签页打开的，关闭标签页即停止；命令行启动的，空闲后自动停止，也可以在这里停止。 | Started from a tab: stops when the tab closes. Started from the command line: stops automatically when idle, or stop it here. | — |
| workspace.running.idle.hint | 空闲后自动停止 | Stops automatically when idle | — |
| workspace.running.open.aria | 查看 {name} | View {name} | name：项目名，用户自己起的，不翻译 |
| workspace.running.sourceCli.label | 命令行 · {agent} | CLI · {agent} | agent：智能体的名称（如 Claude Code），来自命令行的启动记录，原样显示 |
| workspace.running.sourceCliPlain.label | 命令行 | CLI | — |
| workspace.running.sourceTab.label | 标签页 | Tab | — |
| workspace.running.stop.action | 停止 | Stop | — |
| workspace.running.stop.aria | 停止 {name} | Stop {name} | name：项目名，用户自己起的，不翻译 |
| workspace.running.stopAll.action | 全部停止 | Stop all | — |
| workspace.running.title | 运行中 | Running | — |
| workspace.running.uptime.label | 已运行 {duration} | Up {duration} | duration：已运行的时长，由格式化函数生成，如“47 分钟”“2 小时 14 分钟” |
| workspace.tab.close.label | 关闭 {name} | Close {name} | name：项目名，用户自己起的，不翻译 |
| workspace.tabs.aria | 标签页 | Tabs | — |
| workspace.tabs.more.aria | 更多标签页 | More tabs | — |
