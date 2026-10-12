# format Specification

## Purpose

约定模板（`template.json` 加 `files/`）和运行器（`runner.json`）这两种数据文件的格式规则、版本号、工具要求的写法，`runyard template lint` 怎样判定一个模板合格，`runyard template test` 的冒烟测试查什么，以及十一个内置模板用哪些固定版本、对用户机器上的工具提什么下限。文件字段的形状最终以协议包里的数据校验定义为准，本规格只约定行为和必须拒绝的写法。八个运行器各自保证什么在 templates/runners，另存为模板和手写模板在 templates/custom，工具检测本身在 toolchain/detection。

## Requirements

### Requirement: 模板是数据，不含命令，创建时不联网
模板 MUST 是一个文件夹：`template.json` 加 `files/`。模板 MUST 通过 `runner` 字段指定一个运行器，自己 MUST NOT 含命令，MUST NOT 有钩子脚本。变量 MUST 只是对 `template.json` 里所列文件中 `{{name}}` 的字面替换，MUST NOT 做表达式、条件或循环。从模板创建项目 MUST NOT 访问网络。创建时 MUST 只把 `files/` 里的文件复制到项目文件夹；`files/` 之外的路径和含 `..` 的路径 MUST 被拒绝。
来源：PRD #prd-template-engineering；PRD #prd-create

#### Scenario: [TEMPLATES-FORMAT-01] 创建不联网
- 前提：测试里网络访问一律失败
- **WHEN** 从内置的 `html` 和 `react19` 模板各创建一个项目
- **THEN** 两次创建都成功，文件齐全；创建过程没有发起任何网络请求
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-02] 变量是字面替换
- 前提：模板声明了变量 `title`，所列文件里有 `{{title}}`，另一个未列出的文件里也有 `{{title}}`
- **WHEN** 用 `--var title=A&B$1` 创建
- **THEN** 所列文件里的 `{{title}}` 被原样替换为 `A&B$1`，没有任何转义或展开；未列出的文件原样保留 `{{title}}`
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-03] 没有钩子
- 前提：模板文件夹里放了一个名为 `postcreate.sh` 的文件，`template.json` 没有任何地方引用它
- **WHEN** 从该模板创建项目
- **THEN** 该文件只是被当作普通文件复制，没有被执行
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-04] 路径不许逃出
- 前提：`template.json` 的文件列表或 `entry` 写成 `../secret` 或绝对路径
- **WHEN** 执行 `template lint`
- **THEN** 报告 `path-escape`，不通过；用它创建项目时不复制任何文件
- 验证：test

### Requirement: `template.json` 的字段和校验
`template.json` MUST 含：整数 `formatVersion`；`id`（小写字母、数字、连字符，首尾不是连字符，即命令行里的模板名）；`name` 和 `description`（`LocalizedText`：一个字符串，或“语言到文字”的对象且 `en` 必填）；`category`（固定的分类标识）；`runner`（运行器标识）；`requires`（见下一条）；`entry`（入口文件，相对 `files/` 的路径，用 `/` 分隔）。MAY 含：`tags`（固定的标签标识）、`variables`（变量名和默认值）、`substitute`（做变量替换的文件）、`maintainer`（具名维护者）。内置模板 MUST 有 `maintainer`。`{{x}}` 出现在 `substitute` 所列文件里而 `variables` 没有声明 `x` 的 MUST 不通过（`name` 由项目名自动提供，除外）。`entry` 或 `substitute` 里的文件不存在 MUST 不通过。
来源：PRD #prd-template-engineering；PRD #prd-template-versions；PRD #prd-decision-table（第 16 项）

#### Scenario: [TEMPLATES-FORMAT-05] 名称缺少英文
- 前提：`name` 是 `{ "zh-CN": "静态页面" }`
- **WHEN** 执行 `template lint`
- **THEN** 报告 `name-missing-en`，不通过；`name` 写成纯字符串则通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-06] 缺必填字段
- **WHEN** 对缺少 `runner` 的模板执行 `template lint`
- **THEN** 报告 `template-json-invalid`，`path` 指向缺的字段，不通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-07] 模板标识的写法
- **WHEN** 对 `id` 为 `My_Template`、`-a`、`a-` 的模板各执行 `template lint`
- **THEN** 三个都报告 `template-json-invalid`，不通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-08] 变量没有声明
- 前提：`substitute` 所列文件里有 `{{color}}`，`variables` 里没有 `color`
- **WHEN** 执行 `template lint`
- **THEN** 报告 `variable-undeclared`，不通过；`{{name}}` 不触发这条
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-09] 入口文件不存在
- 前提：`entry` 指向 `files/` 里没有的文件
- **WHEN** 执行 `template lint`
- **THEN** 报告 `entry-missing`，不通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-10] 内置模板必须有维护者
- **WHEN** 对一个内置模板去掉 `maintainer` 后执行 `template lint`
- **THEN** 报告 `maintainer-missing`；同样的用户模板不报这一条
- 验证：test

### Requirement: 格式版本号，读到更新的就不用
模板和运行器 MUST 带整数 `formatVersion`。程序读到比自己认识的更新的版本时，MUST NOT 使用该文件，MUST 报告 `format-version-unsupported`（`template lint`）；从这样的模板创建项目 MUST 报 `TEMPLATE_INVALID`，MUST NOT 创建文件夹，MUST NOT 改写该模板。程序认识的旧版本 MUST 在内存里升到最新版再使用。
来源：PRD #prd-template-engineering

#### Scenario: [TEMPLATES-FORMAT-11] 更新版本的模板
- 前提：模板的 `formatVersion` 比程序认识的最高版本大 1
- **WHEN** 执行 `template lint`，再执行 `runyard new <该模板> demo`
- **THEN** lint 报告 `format-version-unsupported`；`new` 报 `TEMPLATE_INVALID`，退出码 2，没有创建文件夹，模板文件没有被改动
- 验证：test

### Requirement: 运行器的字段和按类别的约束
`runner.json` MUST 含 `formatVersion`、`id`、`kind`（`server`、`static`、`oneshot` 之一）、`needs`、`run`（`static` 除外）、`preview`、`watch`、`stop`；MAY 含 `setup`、`check`、`ready`；`detect` 和 `actions` 第一版 MUST 被接受但被忽略。`server` MUST 有 `ready`（`http`、`port`、`log` 三种之一，`slowAfterMs` 缺省 30000，只影响界面的“较慢”字样）；`oneshot` MUST NOT 有 `ready`，MAY 有 `check` 和 `run.stdin`；`static` MUST NOT 有 `run` 命令。`needs` MUST 是工具名，或 `{ "anyOf": [...] }` 表示任选其一；版本范围 MUST NOT 写在运行器里。`setup` 若有，MUST 含 `inputs`（这些文件没变且 `stamp` 文件在就跳过安装）、`stamp`、按包管理器区分的 `variants`，`errors` 里每条是“正则加原因”，原因取 `DEPS_OFFLINE`、`RUNTIME_MISSING`、`SETUP_FAILED` 之一，输出没有匹配任何一条时 MUST 判为 `SETUP_FAILED`。`errors` 的匹配对启动阶段的输出 MUST 同样生效。`watch.mode` MUST 是 `none`、`rerun`、`restart` 之一：`rerun` 只用于 `oneshot`，`restart` 只用于 `server`。`preview.type` MUST 是 `web`、`request`、`console` 之一。
来源：PRD #prd-template-engineering；PRD #prd-first-templates；PRD #prd-script-projects

#### Scenario: [TEMPLATES-FORMAT-12] 服务必须有就绪判断
- **WHEN** 对 `kind` 为 `server` 但没有 `ready` 的运行器执行 `template lint`
- **THEN** 报告 `runner-invalid`，不通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-13] 脚本不许有就绪
- **WHEN** 对 `kind` 为 `oneshot` 却写了 `ready` 的运行器执行 `template lint`
- **THEN** 报告 `runner-invalid`，不通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-14] watch 模式和类别要对得上
- **WHEN** 对 `kind` 为 `server` 却写了 `watch.mode: "rerun"` 的运行器执行 `template lint`
- **THEN** 报告 `runner-invalid`，不通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-15] 不认识的原因
- 前提：`setup.errors` 里有一条原因写成 `SOMETHING_ELSE`
- **WHEN** 执行 `template lint`
- **THEN** 报告 `runner-invalid`，不通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-16] 安装失败的分类
- 前提：运行器的 `setup.errors` 登记了“离线未缓存”的特征
- **WHEN** 安装的输出匹配这条特征，以及输出不匹配任何特征
- **THEN** 前者得到 `DEPS_OFFLINE`，后者得到 `SETUP_FAILED`
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-17] 保留字段被忽略
- 前提：运行器里带有 `detect` 和 `actions`
- **WHEN** 加载并运行
- **THEN** 加载成功，两个字段对行为没有影响
- 验证：test

### Requirement: 命令是参数数组，不经过 shell
运行器里的每条命令（`setup`、`check`、`run`）MUST 是字符串数组，MUST NOT 是一整行字符串。数组元素恰好等于 shell 的运算符（`&&`、`||`、`;`、`|`、`&`、`>`、`>>`、`<`），或以 `~` 开头的路径，MUST 被 `template lint` 判为 `command-shell-syntax`；元素内部含这些字符但整体是一个参数（例如 Python 的 `-c` 后面的一段代码）MUST NOT 被误判。第一个元素是工具名时，运行时 MUST 换成检测到的真实路径；占位符 `{port}`、`{entry}`、`{dir}`、`{name}` MUST 按元素替换，空格或特殊字符 MUST NOT 拆开或改写参数。
来源：PRD #prd-template-engineering；技术设计 §4.4

#### Scenario: [TEMPLATES-FORMAT-18] 一整行字符串
- 前提：`run.command` 是 `"node server.js"`（字符串）
- **WHEN** 执行 `template lint`
- **THEN** 报告 `runner-invalid`，不通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-19] shell 运算符作为元素
- 前提：`setup` 的某条命令是 `["pnpm", "install", "&&", "pnpm", "build"]`，另一条以 `"~/bin/tool"` 开头
- **WHEN** 执行 `template lint`
- **THEN** 两处都报告 `command-shell-syntax`，不通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-20] 参数内部的分号不误判
- 前提：`check.command` 是 `["python", "-c", "import ast,sys;ast.parse(open(sys.argv[1]).read())", "{entry}"]`
- **WHEN** 执行 `template lint`
- **THEN** 不报告 `command-shell-syntax`
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-21] 占位符按元素替换
- 前提：项目文件夹路径含空格，`run.command` 里有 `{dir}` 和 `{entry}`
- **WHEN** 启动运行
- **THEN** 每个占位符对应一个完整的参数，路径中的空格不会把参数拆开
- 验证：test

### Requirement: 停止方式、监听地址和端口
`stop` MUST 只写 `mode`（`graceful` 或 `interrupt`）和 `graceMs`，`graceMs` 缺省 MUST 是 2000，且 MUST 是正整数；`stop` 里出现任何信号名（如 `SIGTERM`、`SIGKILL`、`SIGINT`）MUST 被判为 `stop-signal-name`，其他不认识的 `mode` MUST 被判为 `runner-invalid`。服务 MUST 只绑定 `127.0.0.1`：运行器命令或环境变量里出现 `0.0.0.0` 或 `localhost` 作为地址 MUST 被判为 `bind-address`。运行器 MUST NOT 写死端口号：`--port` 一类参数后面是字面数字 MUST 被判为 `port-hardcoded`，端口 MUST 用 `{port}` 传入。运行器 MUST NOT 传 `--no-color`（Vite 和 Next 会因此报错退出）。
来源：PRD #prd-template-engineering；PRD #prd-stop；PRD #prd-ports；ADR 0006

#### Scenario: [TEMPLATES-FORMAT-22] 信号名
- 前提：`stop` 是 `{ "mode": "graceful", "signal": "SIGTERM" }`，另一个运行器写 `"mode": "SIGKILL"`
- **WHEN** 执行 `template lint`
- **THEN** 两个都报告 `stop-signal-name`，不通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-23] graceMs 缺省值
- 前提：`stop` 是 `{ "mode": "graceful" }`
- **WHEN** 加载运行器
- **THEN** `graceMs` 是 2000
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-24] 监听地址
- 前提：服务的命令里有 `--host`、`0.0.0.0`，另一个有 `--host`、`localhost`
- **WHEN** 执行 `template lint`
- **THEN** 两个都报告 `bind-address`；写 `--host`、`127.0.0.1` 的不报
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-25] 写死的端口
- 前提：命令里有 `--port`、`3000`
- **WHEN** 执行 `template lint`
- **THEN** 报告 `port-hardcoded`，不通过；写成 `--port`、`{port}` 通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-26] --no-color
- 前提：Vite 类运行器的命令里有 `--no-color`
- **WHEN** 执行 `template lint`
- **THEN** 报告 `runner-invalid`，不通过
- 验证：test

### Requirement: 每个模板声明运行环境，范围写下限和上限
每个模板的 `requires` MUST 存在：不依赖任何工具的模板写空对象，表示“无”。每个工具项 MUST 含 `version` 范围，MAY 含 `fallback`（缺少时改用的另一个工具，如 pnpm 缺则 npm）和 `install`（覆盖默认安装方式）。范围 MUST 是用空格分隔的比较式（`>=`、`>`、`<=`、`<`），MUST 有下限；缺上限 MUST 只给警告（`range-no-upper`），不算失败；写法不对 MUST 不通过（`range-invalid`）。下限 MUST 是模板实际需要的最低版本，且 MUST NOT 低于厂商仍在支持的最老版本线；上限 MUST 是维护者测试通过的最高主版本，用户机器上的版本超出上限时只提醒“未经测试”，不拦住。用到的工具必须是应用内置的工具定义里有的，或者自己写了 `install`，否则 MUST 不通过（`tool-unknown`）。`fallback` 指向的工具 MUST 也是已知的。
来源：PRD #prd-runtime-requirements；PRD #prd-template-lint-test；技术设计 §8.6.1

#### Scenario: [TEMPLATES-FORMAT-27] 没有声明 requires
- **WHEN** 对没有 `requires` 的模板执行 `template lint`
- **THEN** 报告 `requires-missing`，不通过；`html` 模板写 `"requires": {}` 通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-28] 范围写法
- **WHEN** 对 `version` 为 `latest`、`^22`、`>=22.18 <27` 的三个模板各执行 `template lint`
- **THEN** 前两个报告 `range-invalid`，不通过；第三个通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-29] 只有下限只是警告
- 前提：`version` 为 `>=1.26`
- **WHEN** 执行 `template lint`
- **THEN** 通过，警告里有 `range-no-upper`
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-30] 没有下限
- 前提：`version` 为 `<27`
- **WHEN** 执行 `template lint`
- **THEN** 报告 `range-invalid`，不通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-31] 不认识的工具
- 前提：`requires` 里有 `zig`，应用没有它的工具定义，模板也没写 `install`
- **WHEN** 执行 `template lint`
- **THEN** 报告 `tool-unknown`，不通过；写了 `install` 则通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-32] 回退到另一个工具
- 前提：`pnpm` 项带 `fallback: "npm"`，本机没有 pnpm 但有 npm
- **WHEN** 启动项目
- **THEN** 用 npm 安装，不算失败（规则见 toolchain/detection）；`fallback` 指向未知工具时 `template lint` 报告 `tool-unknown`
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-33] 超出上限只提醒
- 前提：模板要求 Node `>=22.18 <27`，本机是 28.0.0
- **WHEN** 启动项目
- **THEN** 照常运行，带 `TOOL_VERSION_UNTESTED` 提示，不是错误
- 验证：test

### Requirement: 工具定义
应用 MUST 为内置支持的每个工具提供一份工具定义，含三部分：版本支持（应用认识哪些版本）、检测脚本（用什么命令判断是否存在、怎么读出版本号，Go 是 `go version`，其余是 `--version`）、安装方式（按操作系统分开，第一版只给 macOS）。安装提示的选择 MUST 是：已经在用版本管理工具（如 nvm）的，用它的命令；否则系统里有 Homebrew 的，给 Homebrew 的命令；两者都没有时只给官网链接；官网链接 MUST 始终一起给出。应用 MUST NOT 自己执行任何安装命令。模板自己写的安装方式 MUST 只展示，MUST NOT 提供一键执行。
来源：PRD #prd-runtime-requirements；PRD #prd-missing-runtime-prompt

#### Scenario: [TEMPLATES-FORMAT-34] 内置工具齐全
- **WHEN** 读取全部内置工具定义
- **THEN** Node、pnpm、npm、Python、uv、Go 都有定义，每份都含检测命令和 macOS 的安装方式与官网链接；Go 的检测命令是 `go version`
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-35] 安装提示的选择
- 前提：Node 缺失；分别在“有 nvm”“只有 Homebrew”“都没有”三种环境里
- **WHEN** 生成安装提示
- **THEN** 依次是 nvm 的命令加官网链接；Homebrew 的命令加官网链接；只有官网链接
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-36] 只展示不执行
- 前提：用户模板的 `requires` 里写了自己的 `install`
- **WHEN** 项目因缺工具而失败
- **THEN** 该安装方式出现在提示里，但应用没有执行它，也没有提供一键执行的入口
- 验证：test

### Requirement: `template lint` 的判定
`runyard template lint <模板标识或文件夹>` MUST 检查模板和它引用的运行器，覆盖本规格其他要求里写明的全部不通过情形，并 MUST 额外检查：模板指定的运行器必须存在，否则 `runner-not-found`；Node 类模板 MUST 带 `pnpm-workspace.yaml` 且其中只放 `allowBuilds`，缺 `allowBuilds` 报告 `allow-builds-missing`；Node 类模板 MUST 带锁文件，缺则 `lockfile-missing`；模板 `package.json` 里的依赖 MUST 是精确版本，出现 `^`、`~`、`latest`、范围 MUST 报告 `version-not-exact`。结果 MUST 是 `{ "template", "ok", "errors": [...], "warnings": [...] }`，每项含 `rule`、`path`、`message`（英文）；有任何 `errors` 时 `ok` 为 `false`，退出码为 2，输出结果对象。lint 一次 MUST 报出全部问题，MUST NOT 遇到第一个就停。
来源：PRD #prd-template-lint-test；PRD #prd-template-engineering；技术设计 §8.3

#### Scenario: [TEMPLATES-FORMAT-37] 合格的模板
- **WHEN** 对每个内置模板执行 `runyard template lint <id> --json`
- **THEN** 十一个都是 `ok: true`，`errors` 为空，退出码 0
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-38] 一次报全
- 前提：一个模板同时有三处错误（缺 `requires`、命令里有 `&&`、`stop` 里有信号名）
- **WHEN** 执行 `template lint --json`
- **THEN** `errors` 里有三项，规则分别是 `requires-missing`、`command-shell-syntax`、`stop-signal-name`；`ok` 为 `false`；退出码 2
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-39] 运行器不存在
- 前提：`runner` 写成 `no-such-runner`
- **WHEN** 执行 `template lint`
- **THEN** 报告 `runner-not-found`，不通过
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-40] 依赖不是精确版本
- 前提：模板 `package.json` 里 `"react": "^19.3.0"`
- **WHEN** 执行 `template lint`
- **THEN** 报告 `version-not-exact`，`path` 指向这个依赖
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-41] 缺放行列表和锁文件
- 前提：Node 模板没有 `pnpm-workspace.yaml` 里的 `allowBuilds`，也没有锁文件
- **WHEN** 执行 `template lint`
- **THEN** 报告 `allow-builds-missing` 和 `lockfile-missing`
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-42] 按文件夹检查
- **WHEN** 对一个不在模板目录里的文件夹执行 `template lint <绝对路径>`
- **THEN** 照常检查并输出结果；文件夹不存在时报 `TEMPLATE_NOT_FOUND`，退出码 3
- 验证：test

### Requirement: `template test` 冒烟测试
`runyard template test <模板标识>` MUST 在系统临时目录里（MUST NOT 在仓库目录里）依次做：创建项目、安装依赖、启动、等待就绪（脚本是等待退出）、修改入口文件并确认重新加载（服务是重载后仍可访问且内容变化，脚本是重新运行且输出变化）、停止、确认没有残留进程（没有带本次运行标记的进程，端口可重新绑定）。步骤标识 MUST 是 `create`、`install`、`start`、`ready`、`reload`、`stop`、`leftovers`（脚本没有 `ready`）。它 MUST 在命令行进程里直接运行，MUST 用真实的工具。结果 MUST 是 `{ "template", "ok", "runs": [...] }`，每次运行含 `toolVersions`、`steps`（每项含 `step`、`ok`、`ms`，失败的含 `error`）、`ok`。`--tool-version <工具>=<版本>` MUST 指定该次使用的工具版本，找不到时 MUST 报 `TOOL_MISSING`；`--keep-dir` MUST 保留临时目录并在结果里给出 `keptDir`，否则测试结束 MUST 删除它。失败时 MUST 仍输出结果对象，退出码取失败那一步对应的错误码的退出码：工具问题 4，安装 5，启动失败 6，等待超时 7；重新加载没有生效或有残留进程 MUST 用 `TEMPLATE_TEST_FAILED`（6）。
来源：PRD #prd-template-lint-test；PRD #prd-runtime-requirements；技术设计 §8.3

#### Scenario: [TEMPLATES-FORMAT-43] 服务模板的完整流程
- 前提：真实环境，`react19` 模板
- **WHEN** 执行 `runyard template test react19 --json`
- **THEN** `steps` 依次是 `create`、`install`、`start`、`ready`、`reload`、`stop`、`leftovers`，全部 `ok`；退出码 0；临时目录已被删除
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-44] 脚本模板的流程
- **WHEN** 执行 `runyard template test python --json`
- **THEN** `steps` 里没有 `ready`；`reload` 一步确认修改入口文件后脚本重新运行且输出变了
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-45] 重新加载没有生效
- 前提：测试里让修改入口文件后页面内容不变
- **WHEN** 执行 `template test`
- **THEN** `reload` 一步失败，`error` 是 `TEMPLATE_TEST_FAILED`；其余步骤照常记录；退出码 6
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-46] 有残留进程
- 前提：测试里让停止后仍有一个带运行标记的进程活着
- **WHEN** 执行 `template test`
- **THEN** `leftovers` 一步失败，退出码 6
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-47] 缺工具
- 前提：本机没有 Go
- **WHEN** 执行 `runyard template test go --json`
- **THEN** `start` 一步失败，`error` 是 `TOOL_MISSING`；退出码 4
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-48] 离线且依赖未缓存
- 前提：网络不可用，包存储里没有该模板的依赖
- **WHEN** 执行 `template test react19`
- **THEN** `install` 一步失败，`error` 是 `DEPS_OFFLINE`；退出码 5
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-49] 指定工具版本并保留目录
- **WHEN** 执行 `template test node-ts --tool-version node=22.18.0 --keep-dir --json`
- **THEN** 该次运行的 `toolVersions.node` 是 `22.18.0`；结果有 `keptDir`，目录仍然存在；指定的版本找不到时报 `TOOL_MISSING`
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-50] 不在仓库里跑
- **WHEN** 在仓库检出目录里执行 `template test`
- **THEN** 临时目录在系统临时目录下，仓库目录里没有任何新文件
- 验证：test

### Requirement: 十一个内置模板和它们固定的版本
内置模板 MUST 恰好是这十一个：`html`、`react19`、`react18`、`vue3`、`next16`、`nuxt4`、`nuxt3`、`node-ts`、`python`、`go`、`hono`。不同版本 MUST 是不同的模板；同一框架 MUST 最多保留两个版本的模板。模板自带的依赖 MUST 是精确版本，取值以技术设计 §8.6.5 为准：React 19.3.0、React 18.3.1、Vite 8.3.3、`@vitejs/plugin-react` 6.1.1、TypeScript 6.0.3、Vue 3.5.43、`@vitejs/plugin-vue` 6.0.9、Next.js 16.3.8、Nuxt 4.5.2、Nuxt 3.21.11、Hono 4.13.11、`@hono/node-server` 2.1.3。用户机器上的工具下限 MUST 是：`node-ts` 的 Node `>=22.18`，`python` 的 Python `>=3.12`，`go` 的 Go `>=1.26`，用 pnpm 的模板的 pnpm `>=10.34.6`；使用 Node 的其他模板的 Node 下限 MUST NOT 低于 22 这条版本线。`nuxt3` MUST 带“已停止维护”的标签（固定标签标识 `unmaintained`）；出现 Nuxt 3 自身代码上的、没有修复版本的高危公告时 MUST 自动从内置目录移除。已移除或退役的模板 MUST NOT 影响此前创建的项目：项目创建时已把 `runner` 和 `requires` 复制进自己的 `playground.json`，MUST 继续可用。
来源：PRD #prd-first-templates；PRD #prd-template-versions；PRD #prd-runtime-requirements；技术设计 §8.6.5；技术设计 §12 第 28 项

#### Scenario: [TEMPLATES-FORMAT-51] 目录恰好十一个
- **WHEN** 读取内置模板目录
- **THEN** 标识恰好是上面十一个，没有多余的
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-52] 依赖是技术设计里的精确版本
- **WHEN** 读取每个内置模板的 `package.json`
- **THEN** 其中的 React、Vite、Vue、Next.js、Nuxt、Hono 等的版本与上面列出的完全一致，没有 `^`、`~`、`latest`
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-53] 工具下限
- **WHEN** 读取 `node-ts`、`python`、`go` 和用 pnpm 的模板的 `requires`
- **THEN** 下限依次是 Node 22.18、Python 3.12、Go 1.26、pnpm 10.34.6；其他 Node 模板的 Node 下限不低于 22
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-54] Nuxt 3 带停止维护标签
- **WHEN** 执行 `runyard template list --json`
- **THEN** `nuxt3` 的 `tags` 含 `unmaintained`，其他模板没有；`nuxt4` 没有
- 验证：test

#### Scenario: [TEMPLATES-FORMAT-55] Nuxt 3 出现无法修复的高危公告
- 前提：每晚的依赖审计发现 Nuxt 3 自身代码有高危公告且没有修复版本
- **WHEN** 审计任务运行
- **THEN** `nuxt3` 自动从内置目录移除，并开出一个 issue 记录原因
- 验证：manual（由每晚的依赖审计任务触发，需要真实出现这样的公告才能验证；移除逻辑本身由目录检查的测试覆盖）

#### Scenario: [TEMPLATES-FORMAT-56] 模板退役不影响旧项目
- 前提：用 `react18` 创建过项目，之后该模板从内置目录移除
- **WHEN** 启动这个旧项目
- **THEN** 正常启动，使用项目自己记下的 `runner` 和 `requires`，锁文件不受影响
- 验证：test

### Requirement: 模板被接受和被移除的条件
一个模板 MUST 有具名维护者且冒烟测试通过，才被接受进内置目录；连续 30 天冒烟测试不通过的模板 MUST 从模板索引中移除。拉取请求 MUST 对改动过的模板运行 `template lint` 和冒烟测试（只用版本上限）；每晚 MUST 对全部模板在上限和下限两个版本上运行冒烟测试，失败自动开 issue。
来源：PRD #prd-template-engineering；PRD #prd-template-lint-test；技术设计 §8.3

#### Scenario: [TEMPLATES-FORMAT-57] 连续 30 天不通过
- 前提：某个模板的每晚冒烟测试已连续 30 天失败
- **WHEN** 第 30 天的每晚任务结束
- **THEN** 该模板从模板索引中移除，并有 issue 记录
- 验证：manual（需要连续 30 天的真实测试记录；索引生成脚本的逻辑由测试覆盖）

#### Scenario: [TEMPLATES-FORMAT-58] 拉取请求只测改动的模板
- 前提：一个拉取请求只改了 `hono` 模板
- **WHEN** 持续集成运行模板任务
- **THEN** 只对 `hono` 运行 lint 和冒烟测试，且只用版本上限
- 验证：manual（属于持续集成的配置，在 CI 上观察一次拉取请求的运行即可确认）
