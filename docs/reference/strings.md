# 文案一览

<!-- 由 pnpm generate 生成，不要手改。来源：packages/i18n/locales/ -->

一行一个键：中文是源语言，英文在同一个 PR 里补齐。改文案去 `packages/i18n/locales/`，再运行 `pnpm generate`。

| 键 | 中文 | 英文 | 备注 |
| --- | --- | --- | --- |
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
| errors.NAME_EXISTS.body | 资源库里已经有同名的项目，现有项目没有改动。 | The library already has a playground with this name. The existing playground is unchanged. | — |
| errors.NAME_EXISTS.hint | 换一个名称。 | Choose a different name. | — |
| errors.NAME_EXISTS.hintCli | 换一个名称，重新运行这条命令。 | Run the command again with a different name. | — |
| errors.NAME_EXISTS.title | 项目名称 {name} 已被占用 | A playground named {name} already exists | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.NAME_INVALID.body | 名称只能包含小写字母、数字和连字符，最长 64 个字符，开头和结尾不能是连字符。 | A name can contain only lowercase letters, digits and hyphens. It can be up to 64 characters long and cannot start or end with a hyphen. | — |
| errors.NAME_INVALID.hint | 改用符合这些规则的名称。 | Use a name that follows these rules. | — |
| errors.NAME_INVALID.hintCli | 用符合这些规则的名称重新运行这条命令。 | Run the command again with a name that follows these rules. | — |
| errors.NAME_INVALID.title | 项目名称「{name}」不合法 | Invalid playground name "{name}" | name：项目名称（也是文件夹名）；命令行传路径时是用户给的原文 |
| errors.NAME_RESERVED.body | con、nul、com1 这类名称是 Windows 的保留名。Runyard 在所有系统上都不接受它们，资源库因此可以直接搬到 Windows。 | Names such as con, nul and com1 are reserved by Windows. Runyard rejects them on every system so that the library can later move to Windows. | — |
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
| errors.SUPERVISOR_UNAVAILABLE.hintCli | 没有发送过任何请求，可以直接重新运行这条命令。 | No request was sent, so you can simply run the command again. | — |
| errors.SUPERVISOR_UNAVAILABLE.title | 连不上 Runyard 的管理进程 | Cannot connect to the Runyard background process | — |
| errors.TEMPLATE_NOT_FOUND.body | 没有标识为这个名字的模板。 | There is no template with this ID. | — |
| errors.TEMPLATE_NOT_FOUND.hint | 检查模板标识是否拼写正确。 | Check that the template ID is spelled correctly. | — |
| errors.TEMPLATE_NOT_FOUND.hintCli | 运行 runyard template list 查看可用的模板。 | Run runyard template list to see the available templates. | — |
| errors.TEMPLATE_NOT_FOUND.title | 找不到模板「{template}」 | Template "{template}" not found | template：用户给的模板标识，原样显示 |
| errors.TOOL_MISSING.body | 运行这个项目需要 {tool}（版本 {required}），但没有在这台电脑上找到它。项目已经创建，代码可以照常编辑。 | This playground needs {tool} ({required}), but it was not found on this computer. The playground is created and you can still edit the code. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译 |
| errors.TOOL_MISSING.hint | 安装 {tool} 后点“重新检测”，项目就会启动。 | Install {tool}, then click "Check again" and the playground will start. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译 |
| errors.TOOL_MISSING.hintCli | 安装 {tool}（{required}）后重新运行这条命令。 | Install {tool} ({required}), then run the command again. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译 |
| errors.TOOL_MISSING.title | 没有找到 {tool} | Cannot find {tool} | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译 |
| errors.TOOL_TOO_OLD.body | 这个项目需要 {tool} {required}，当前是 {found}。项目已经创建，代码可以照常编辑。 | This playground needs {tool} {required}, but {found} is installed. The playground is created and you can still edit the code. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译；found：本机检测到的版本，例如 20.11.0；原样显示，不翻译 |
| errors.TOOL_TOO_OLD.hint | 把 {tool} 升级到 {required} 后点“重新检测”。 | Upgrade {tool} to {required}, then click "Check again". | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译 |
| errors.TOOL_TOO_OLD.hintCli | 把 {tool} 升级到 {required} 后重新运行这条命令。 | Upgrade {tool} to {required}, then run the command again. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译 |
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
| notice.DEPS_FROM_CACHE | 依赖来自本机缓存。 | Dependencies came from the local cache. | — |
| notice.ENV_DEGRADED | 只读到了非交互的终端环境，工具检测的结果可能不准。 | Only the non-interactive terminal environment could be read, so tool detection may be inaccurate. | — |
| notice.ENV_UNRESOLVED | 没能读取你终端的环境（{reason, select, timeout {读取超时} other {读取失败}}），工具检测的结果可能不准。先用常用目录的扫描结果，后台会再试一次。 | Could not read your terminal environment ({reason, select, timeout {timed out} other {failed}}), so tool detection may be inaccurate. Runyard is using a scan of common directories for now and will try again in the background. | reason：读取失败的原因：timeout（超时）或 failed（失败）；用 select 选词 |
| notice.IDLE_STOPPED | 空闲 {minutes, plural, other {# 分钟}}，已自动停止。 | Stopped automatically after being idle for {minutes, plural, one {# minute} other {# minutes}}. | minutes：空闲分钟数，正整数；文案里写复数 |
| notice.PACKAGE_MANAGER_FALLBACK | 没有找到 {wanted}，已改用 {used}。 | {wanted} was not found, so {used} is used instead. | wanted：首选的包管理器名，例如 pnpm；原样显示；used：实际改用的包管理器名，例如 npm；原样显示 |
| notice.PATH_NEAR_LIMIT | 项目路径有 {length, plural, other {# 个字符}}，接近系统允许的上限（{limit, number} 个字符）。创建照常进行；缩短名称或换一个更短的资源库位置可以避开这个问题。 | The playground path is {length, plural, one {# character} other {# characters}} long, close to the system limit of {limit, number}. Creation continues. A shorter name or a shorter library location avoids the problem. | length：项目路径的字符数，正整数；文案里写复数；limit：当前系统的路径长度上限（字符数），由平台层给出；原样显示 |
| notice.PORT_FALLBACK | {wanted} 端口{reason, select, PORT_RESERVED {被系统保留} other {被占用}}，本次改用 {actual} 端口。下次启动仍会先试 {wanted} 端口。 | Port {wanted} is {reason, select, PORT_RESERVED {reserved by the system} other {in use}}, so this run uses port {actual}. The next run tries {wanted} first. | wanted：项目登记的端口号，例如 7101；原样显示，不加千分位；reason：回退原因：PORT_OCCUPIED（被占用）或 PORT_RESERVED（被系统保留）；用 select 选词；actual：本次实际使用的端口号；原样显示，不加千分位 |
| notice.PROCESS_EXITED | 进程已退出{exitCode, select, none {} other {，退出码 {exitCode}}}{signal, select, none {} other {，信号 {signal}}}。 | The process exited{exitCode, select, none {} other { with code {exitCode}}}{signal, select, none {} other { (signal {signal})}}. | exitCode：进程的退出码（整数），可选；没传时翻译函数自动传 none，文案用 select 的 none 分支；signal：终止进程的信号名，例如 SIGKILL，可选；原样显示，不翻译；没传时同上 |
| notice.RELOADING | 文件有改动，正在重载。 | Files changed, reloading. | — |
| notice.STOPPED_BY_USER | 你停止了这个项目。 | You stopped this playground. | — |
| notice.TOOL_VERSION_UNTESTED | {tool} {found} 高于这个模板测试过的范围（{required}）。照常运行，但没有经过测试。 | {tool} {found} is newer than the range this template was tested with ({required}). It runs as usual but is untested. | tool：工具标识，例如 node、go、python；由模板的工具定义决定，原样显示，不翻译；found：本机检测到的版本，例如 20.11.0；原样显示，不翻译；required：模板要求的版本范围，例如 >=22.18；原样显示，不翻译 |
| platform.fileManager | {platform, select, other {访达}} | {platform, select, other {Finder}} | — |
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
