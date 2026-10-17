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
| cli.config.getLang.body | {lang}（来源：{source, select, flag {--lang} env {RUNYARD_LANG} saved {已保存的设置} other {默认值}}） | {lang} (source: {source, select, flag {--lang} env {RUNYARD_LANG} saved {saved setting} other {default}}) | lang：生效的语言，en 或 zh-CN，原样显示；source：来源：flag、env、saved 或 default；用 select 选词 |
| cli.config.setLang.body | 语言已设为 {lang}。 | Language set to {lang}. | lang：写入的语言，en 或 zh-CN，原样显示 |
| cli.doctor.bundle.body | 诊断包已导出：{path} | Diagnostics bundle exported: {path} | path：诊断包的绝对路径，原样显示 |
| cli.doctor.cli.body | 命令行：版本 {version}，{kind, select, app {随应用安装} other {从源码运行}}，位置 {path} | Command line: version {version}, {kind, select, app {installed with the app} other {run from source}}, at {path} | version：命令行版本，原样显示；kind：app 或 source；用 select 选词；path：命令行位置，原样显示 |
| cli.doctor.installCommand.body | 安装方法（只是提示，不会自动执行）：{command} | How to install (a hint only, nothing is run for you): {command} | command：安装命令，原样显示 |
| cli.doctor.installUrl.body | 官网：{url} | Website: {url} | url：官网链接，原样显示 |
| cli.doctor.library.body | 资源库：{root} | Library: {root} | root：资源库文件夹的绝对路径，原样显示 |
| cli.doctor.other.body | PATH 上还有另一份：{kind, select, app {随应用安装} other {从源码运行}}，版本 {version}，位置 {path} | Another copy is on PATH: {kind, select, app {installed with the app} other {run from source}}, version {version}, at {path} | kind：app 或 source；用 select 选词；version：版本，认不出时是问号；path：位置，原样显示 |
| cli.doctor.supervisorDown.body | 管理进程：不可用（{reason}） | Background process: not available ({reason}) | reason：错误码，原样显示 |
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
| desktop.category.frontend.label | 前端 | Front end | — |
| desktop.category.fullstack.label | 全栈 | Full stack | — |
| desktop.category.mine.label | 我的 | Mine | — |
| desktop.category.page.label | 页面 | Pages | — |
| desktop.category.script.label | 脚本 | Scripts | — |
| desktop.category.service.label | 服务 | Services | — |
| desktop.console.tab.label | 输出 | Output | — |
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
| desktop.menu.new.label | 新建… | New… | — |
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
| desktop.output.aria | 进程输出 | Process output | — |
| desktop.output.empty.label | 还没有输出。 | No output yet. | — |
| desktop.output.view.action | 查看完整输出 | View full output | — |
| desktop.picker.arrowsKey.label | 上下键 | Up/Down | — |
| desktop.picker.choose.action | 选择 | Select | — |
| desktop.picker.dialog.aria | 选择模板 | Choose a template | — |
| desktop.picker.empty.hint | 没有可用的模板。 | No templates available. | — |
| desktop.picker.enterKey.label | 回车 | Return | — |
| desktop.picker.escKey.label | esc | esc | — |
| desktop.picker.list.aria | 模板列表 | Templates | — |
| desktop.picker.move.hint | 移动 | move | — |
| desktop.picker.next.hint | 下一步：填写名称和备注 | next: name and note | — |
| desktop.picker.noMatch.hint | 没有匹配的模板。 | No matching templates. | — |
| desktop.picker.recent.label | 最近使用 | Recently used | — |
| desktop.picker.search.label | 搜索模板 | Search templates | — |
| desktop.picker.search.placeholder | 搜索模板：名称、框架、语言 | Search templates: name, framework, language | — |
| desktop.port.body.label | 已改用 {actual} 端口。 | Switched to port {actual}. | actual：现在实际使用的端口，纯数字字符串 |
| desktop.port.dismiss.action | 知道了 | Got it | — |
| desktop.port.occupant.label | 占用者：{name}（PID {pid}） | In use by: {name} (PID {pid}) | name：占用端口的进程名，原样显示；pid：占用者的进程号 |
| desktop.port.title | {wanted} 端口{reason, select, PORT_RESERVED {被系统保留} other {被占用}} | Port {wanted} is {reason, select, PORT_RESERVED {reserved by the system} other {in use}} | wanted：原来想用的端口，纯数字字符串；reason：PORT_OCCUPIED 或 PORT_RESERVED |
| desktop.port.untouched.label | 没有结束占用者，它仍在运行。 | The other program was not stopped; it is still running. | — |
| desktop.preview.frame.label | 页面预览的截图 | Screenshot of the page preview | — |
| desktop.preview.waiting.label | 页面还没有就绪，就绪后会显示在这里。 | The page isn't ready yet. It shows up here once it is. | — |
| desktop.rerun.action | 重新运行 | Run again | — |
| desktop.run.action | 运行 | Run | — |
| desktop.runbar.aria | 运行条 | Run bar | — |
| desktop.runbar.closeHint.label | 关闭标签页即停止 | Stops when the tab closes | — |
| desktop.runbar.missing.label | 缺少 {tool} | {tool} is missing | tool：工具标识，如 go、node |
| desktop.runbar.state.label | {state} :{port} | {state} :{port} | state：运行状态的名字，来自 runState.<状态>；port：端口号，纯数字字符串（不加千分位） |
| desktop.runbar.tooOld.label | {tool} 版本过低 | {tool} is too old | tool：工具标识，如 go、node |
| desktop.script.ended.label | {state} · 退出码 {exitCode} · {duration} | {state} · exit code {exitCode} · {duration} | state：运行状态的名字，来自 runState.<状态>；exitCode：进程的退出码；duration：这次运行的总耗时 |
| desktop.script.endedNoCode.label | {state} · {duration} | {state} · {duration} | state：运行状态的名字，来自 runState.<状态>；duration：这次运行的总耗时 |
| desktop.script.running.label | {state} · 已 {duration} | {state} · {duration} | state：运行状态的名字，来自 runState.<状态>；duration：已经运行的时长，如 3.2 秒 |
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
| errors.SUPERVISOR_OUTDATED.body | 正在运行的管理进程比当前使用的 Runyard 旧，换成新版本会停掉 {runs, plural, other {# 个运行}}。命令没有继续执行。 | The running background process is older than the Runyard you are using. Replacing it would stop {runs, plural, one {# run} other {# runs}}. The command did not continue. | runs：升级管理进程会停掉的运行个数，非负整数；英文写复数 |
| errors.SUPERVISOR_OUTDATED.hint | 应用会先告诉你会停掉几个运行，你确认后才会更新。 | The app tells you how many runs will stop and updates only after you confirm. | — |
| errors.SUPERVISOR_OUTDATED.hintCli | 运行 runyard stop --all 停止全部运行，管理进程随后会自动更新，然后重新运行这条命令。 | Run runyard stop --all to stop every run. The background process then updates itself. After that, run the command again. | — |
| errors.SUPERVISOR_OUTDATED.title | 后台的管理进程版本较旧 | The Runyard background process is out of date | — |
| errors.SUPERVISOR_UNAVAILABLE.body | 没能和后台的管理进程建立可信的连接。 | A trusted connection to the background process could not be established. | — |
| errors.SUPERVISOR_UNAVAILABLE.hint | 没有发送过任何请求，可以直接重新运行。 | No request was sent, so you can simply run it again. | — |
| errors.SUPERVISOR_UNAVAILABLE.hintCli | 没有发送过任何请求。运行 runyard doctor 查看原因，再重新运行这条命令。 | No request was sent. Run runyard doctor to find out why, then run the command again. | — |
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
| errors.TOOL_MISSING.hintCli | 安装 {tool}（{required}），用 runyard doctor 确认后{name, select, none {重新运行这条命令。} other {运行 runyard run {name}。}}{installCommand, select, none {} other { 项目写的安装命令（应用不会替你运行）：`{installCommand}`}}{installUrl, select, none {} other { 安装说明：{installUrl}}} | Install {tool} ({required}), check it with runyard doctor, then {name, select, none {run the command again.} other {run runyard run {name}.}}{installCommand, select, none {} other { Install command from the playground (Runyard will not run it): `{installCommand}`}}{installUrl, select, none {} other { Install instructions: {installUrl}}} | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译；name：被阻止运行的项目名称（也是文件夹名）；可选，没有时（如只检测工具）提示改为“重新运行这条命令”；installCommand：项目（模板 requires 的 install）自带的安装命令，参数用空格连成一行；可选，没有时不显示。只展示，从不运行；installUrl：项目自带的安装说明链接；可选，没有时不显示 |
| errors.TOOL_MISSING.title | 没有找到 {tool} | Cannot find {tool} | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译 |
| errors.TOOL_TOO_OLD.body | 这个项目需要 {tool} {required}，当前是 {found}。项目已经创建，代码可以照常编辑。 | This playground needs {tool} {required}, but {found} is installed. The playground is created and you can still edit the code. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译；found：本机检测到的版本，例如 20.11.0；原样显示，不翻译 |
| errors.TOOL_TOO_OLD.hint | 把 {tool} 升级到 {required} 后点“重新检测”。 | Upgrade {tool} to {required}, then click "Check again". | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译 |
| errors.TOOL_TOO_OLD.hintCli | 把 {tool} 升级到 {required}，用 runyard doctor 确认后{name, select, none {重新运行这条命令。} other {运行 runyard run {name}。}}{installCommand, select, none {} other { 项目写的安装命令（应用不会替你运行）：`{installCommand}`}}{installUrl, select, none {} other { 安装说明：{installUrl}}} | Upgrade {tool} to {required}, check it with runyard doctor, then {name, select, none {run the command again.} other {run runyard run {name}.}}{installCommand, select, none {} other { Install command from the playground (Runyard will not run it): `{installCommand}`}}{installUrl, select, none {} other { Install instructions: {installUrl}}} | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译；name：被阻止运行的项目名称（也是文件夹名）；可选，没有时（如只检测工具）提示改为“重新运行这条命令”；installCommand：项目（模板 requires 的 install）自带的安装命令，参数用空格连成一行；可选，没有时不显示。只展示，从不运行；installUrl：项目自带的安装说明链接；可选，没有时不显示 |
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
| library.creator.me.label | 我 | Me | — |
| library.empty.cli.label | 也可以让智能体用命令行创建： | Or let an agent create one from the command line: | — |
| library.empty.hint | 选一个模板，新建你的第一个项目。 | Pick a template to create your first playground. | — |
| library.empty.title | 还没有项目 | No playgrounds yet | — |
| library.filter.agent.label | 智能体创建 | Created by agents | — |
| library.filter.all.label | 全部 | All | — |
| library.filter.autoClean.label | 自动清理 | Auto-clean | — |
| library.filter.kept.label | 已保留 | Kept | — |
| library.filter.sort.label | 排序：{value} | Sort: {value} | value：当前选中的排序名 |
| library.filter.status.label | 状态：{value} | Status: {value} | value：当前选中的状态名 |
| library.filter.type.label | 类型：{value} | Type: {value} | value：当前选中的类型名 |
| library.menu.sort.aria | 排序方式 | Sort order | — |
| library.menu.status.aria | 按状态筛选 | Filter by status | — |
| library.menu.type.aria | 按类型筛选 | Filter by type | — |
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
| library.note.empty.label | 未填写备注 | No note | — |
| library.page.results.label | {count, plural, other {# 个结果}} · 共 {total, plural, other {# 个项目}} · 存放在 {root} | {count, plural, one {# result} other {# results}} · {total, plural, one {# playground} other {# playgrounds}} · stored in {root} | count：搜索和筛选后剩下的项目数；total：资源库里项目的总数；root：资源库根目录（主目录缩成 ~） |
| library.page.summary.label | {total, plural, other {# 个项目}} · {running, plural, other {# 个正在运行}} · 存放在 {root} | {total, plural, one {# playground} other {# playgrounds}} · {running, plural, one {# running} other {# running}} · stored in {root} | total：资源库里项目的总数；running：正在运行的项目数；root：资源库根目录（主目录缩成 ~） |
| library.retention.autoClean.label | 剩 {days, plural, other {# 天}} | {days, plural, one {# day} other {# days}} left | days：距离自动清理还剩的天数 |
| library.retention.autoClean.tooltip | {days, plural, other {# 天}}没打开就移到{term_trash}，每次打开重新计时 | Moved to the {term_trash} after {days, plural, one {# day} other {# days}} unopened; the count restarts on every open | days：自动清理设定的天数 |
| library.retention.kept.label | 已保留 | Kept | — |
| library.row.copyPath.action | 复制路径 | Copy path | — |
| library.row.more.aria | {name} 的更多操作 | More actions for {name} | name：项目名（用户自己起的，不翻译） |
| library.row.open.action | 打开 | Open | — |
| library.row.openHint.label | 回车 | Enter | — |
| library.row.reveal.action | 在{term_fileManager}中显示 | Show in {term_fileManager} | — |
| library.row.stop.action | 停止运行 | Stop | — |
| library.search.clear.aria | 清除搜索 | Clear search | — |
| library.search.key.label | {term_searchShortcut} | {term_searchShortcut} | — |
| library.search.label | 搜索项目 | Search playgrounds | — |
| library.search.placeholder | 搜索名称、备注、模板 | Search name, note, template | — |
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
| notice.TOOL_VERSION_UNTESTED | {tool} {found} 高于这个模板测试过的范围（{required}）。照常运行，但没有经过测试。 | {tool} {found} is newer than the range this template was tested with ({required}). It runs as usual but is untested. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；found：本机检测到的版本，例如 20.11.0；原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译 |
| platform.fileManager | {platform, select, other {访达}} | {platform, select, other {Finder}} | — |
| platform.searchShortcut | {platform, select, other {⌘F}} | {platform, select, other {⌘F}} | — |
| platform.trash | {platform, select, other {废纸篓}} | {platform, select, other {Trash}} | — |
| runState.checking | 检查工具 | Checking tools | — |
| runState.crashed | 已崩溃 | Crashed | — |
| runState.errored | 已出错 | Failed | — |
| runState.failed | 启动失败 | Failed to start | — |
| runState.finished | 已结束 | Finished | — |
| runState.installing | 安装依赖 | Installing dependencies | — |
| runState.ready | 就绪 | Ready | — |
| runState.reloading | 重载中 | Reloading | — |
| runState.running | 运行中 | Running | — |
| runState.starting | 启动中 | Starting | — |
| runState.stopped | 已停止 | Stopped | — |
| runState.stopping | 停止中 | Stopping | — |
| workspace.closeConfirm.body | 关闭标签页会停止这个项目。代码和文件不受影响，下次打开会重新运行。 | Closing the tab stops this playground. Your code and files are not affected, and it runs again the next time you open it. | — |
| workspace.closeConfirm.cancel.action | 取消 | Cancel | — |
| workspace.closeConfirm.confirm.action | 关闭并停止 | Close and stop | — |
| workspace.closeConfirm.optOut.hint | 以后关闭标签页直接停止。可以在“设置 › 编辑与运行”里重新打开提示。 | Tabs will then close and stop right away. You can turn the prompt back on in Settings › Editing and running. | — |
| workspace.closeConfirm.optOut.label | 不再提示 | Don’t ask again | — |
| workspace.closeConfirm.title | 关闭 {name} 并停止运行？ | Close {name} and stop it? | name：项目名，用户自己起的，不翻译 |
| workspace.files.add.aria | 在项目根新建 | New at the playground root | — |
| workspace.files.create.aria | 新文件或文件夹的名称 | Name of the new file or folder | — |
| workspace.files.empty.hint | 这个项目里还没有文件 | There are no files in this playground yet | — |
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
| workspace.tab.close.label | 关闭 {name} | Close {name} | name：项目名，用户自己起的，不翻译 |
| workspace.tabs.aria | 标签页 | Tabs | — |
