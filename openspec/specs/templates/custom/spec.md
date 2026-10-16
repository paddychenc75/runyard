# custom Specification

## Purpose

约定用户自己的模板：把一个项目另存为模板（`runyard template save`），或者在 `~/.runyard/templates/` 里手写模板。两者都立即出现在模板列表的“我的”分组里，用法和内置模板一样。本规格约定另存时哪些文件进模板、哪些默认不进，怎样把项目名换成变量，手写的模板怎样被发现和校验，以及用户模板和内置模板重名时怎么办。模板和运行器的格式规则、`template lint`、冒烟测试在 templates/format；七个运行器在 templates/runners。第一版不做：编辑、删除、复制为自己的模板，从 git 安装模板仓库。界面入口（资源库行和工作区“更多”菜单里的“另存为模板”、模板页）属于桌面应用，不在这里。

## Requirements

### Requirement: 把项目另存为模板
`runyard template save <pg> --as <标识>` MUST 在 `~/.runyard/templates/<标识>/` 下生成 `template.json` 和 `files/`。`<标识>` MUST 只含小写字母、数字、连字符且首尾不是连字符，否则报 `NAME_INVALID`（2）。该标识已被用户模板或内置模板占用时 MUST 报 `NAME_EXISTS`（9），MUST NOT 覆盖。运行器和运行环境（`runner`、`requires`）MUST 沿用原项目 `playground.json` 里记下的，MUST NOT 重新检测。`--name` 和 `--description` 给出的是一个字符串，缺省时名称取标识、说明为空。另存 MUST 先写临时目录再改名为最终目录，失败时 MUST NOT 留下不完整的模板；另存 MUST NOT 改动原项目。结果 MUST 是 `{ "id", "name", "path", "files": [...], "source": "user" }`。原项目不存在 MUST 报 `PLAYGROUND_NOT_FOUND`，文件夹找不到 MUST 报 `FOLDER_MISSING`。
来源：PRD #prd-save-as-template；PRD #prd-custom-templates；PRD #prd-cli-commands

#### Scenario: [TEMPLATES-CUSTOM-01] 另存一个项目
- 前提：由 `react19` 创建的项目 `pricing-table`，里面改过 `src/App.tsx`
- **WHEN** 执行 `runyard template save pricing-table --as my-pricing --name "My pricing" --json`
- **THEN** `~/.runyard/templates/my-pricing/` 下有 `template.json` 和 `files/`；`files/src/App.tsx` 是改过的内容；结果含 `id`、`name`、绝对 `path`、`files`、`source: "user"`；`template.json` 的 `runner` 和 `requires` 与原项目记下的相同
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-02] 立即出现在列表里
- 前提：上一个场景之后，应用和管理进程没有重启
- **WHEN** 执行 `runyard template list --json`，再执行 `runyard new my-pricing copy-1`
- **THEN** 列表里有 `my-pricing`，`source` 是 `"user"`；`new` 成功，新项目里是改过的 `src/App.tsx`
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-03] 标识的写法
- **WHEN** 用 `--as My_Template`、`--as -a`、`--as a-` 另存
- **THEN** 三个都报 `NAME_INVALID`，退出码 2，没有生成任何文件夹
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-04] 标识已被占用
- 前提：已有用户模板 `my-pricing`
- **WHEN** 再用 `--as my-pricing` 另存，以及用 `--as react19` 另存
- **THEN** 两次都报 `NAME_EXISTS`，退出码 9；已有模板的文件没有被改动
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-05] 沿用原项目的运行环境
- 前提：项目创建后，内置模板 `react19` 的运行环境下限又被抬高了
- **WHEN** 另存该项目
- **THEN** 新模板的 `requires` 与项目创建时记下的一致，不是内置模板现在的
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-06] 失败不留残片
- 前提：测试里让写 `files/` 中途失败
- **WHEN** 另存
- **THEN** `~/.runyard/templates/` 下没有新的文件夹，也没有遗留的临时目录
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-07] 不改动原项目
- **WHEN** 另存一个项目
- **THEN** 原项目文件夹里的所有文件（包括 `.runyard/playground.json`）与另存之前逐字节相同
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-08] 项目不存在或文件夹找不到
- **WHEN** 对不存在的项目、和文件夹被移走的项目各执行 `template save`
- **THEN** 分别报 `PLAYGROUND_NOT_FOUND` 和 `FOLDER_MISSING`，退出码 3
- 验证：test

### Requirement: 另存时哪些文件进模板
`.runyard/` 目录（含项目的身份和端口信息）MUST 永远不进模板。依赖目录（至少含 `node_modules`、`.venv`）、构建产物（至少含 `dist`、`build`、`.next`、`.nuxt`、`.output`、`__pycache__`）、`.env` 和 `.env.*`、版本控制目录 `.git` MUST 默认不进模板。锁文件和源码 MUST 默认进模板。`--include <相对路径>` MUST 能把默认不进的文件加进来（`.runyard/` 除外），`--exclude <相对路径>` MUST 能去掉默认会进的文件；两者可重复。路径 MUST 是相对项目文件夹的、用 `/` 分隔的路径，绝对路径和含 `..` 的 MUST 报 `USAGE`。
来源：PRD #prd-save-as-template

#### Scenario: [TEMPLATES-CUSTOM-09] 默认排除
- 前提：项目里有 `node_modules/`、`dist/`、`.next/`、`__pycache__/`、`.env`、`.env.local`、`.git/`、`.runyard/`、`pnpm-lock.yaml`、`src/main.ts`
- **WHEN** 另存
- **THEN** 模板的 `files/` 里只有 `pnpm-lock.yaml` 和 `src/main.ts`
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-10] 明确加入 .env
- 前提：同上
- **WHEN** 加 `--include .env` 另存
- **THEN** `files/.env` 在模板里；`node_modules` 等其他默认排除项仍不在
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-11] .runyard 无法加入
- **WHEN** 加 `--include .runyard/playground.json` 另存
- **THEN** 模板里仍然没有 `.runyard/`，也没有报错
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-12] 再去掉一个默认会进的文件
- **WHEN** 加 `--exclude src/secret.ts` 另存
- **THEN** 模板的 `files/` 里没有 `src/secret.ts`
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-13] 不合法的路径
- **WHEN** 加 `--include ../outside` 或 `--exclude /etc/passwd`
- **THEN** 报 `USAGE`，退出码 2，没有生成模板
- 验证：test

### Requirement: 可选把项目名换成变量
`runyard template save` 带 `--replace-name` 时，MUST 把进入模板的文本文件里出现的项目名替换为 `{{name}}`，并把这些文件登记进 `template.json` 的 `substitute`；不带时 MUST NOT 做任何替换。二进制文件 MUST NOT 被替换。用这个模板创建项目时，`{{name}}` MUST 被替换为新项目的名称。
来源：PRD #prd-save-as-template

#### Scenario: [TEMPLATES-CUSTOM-14] 项目名换成变量
- 前提：项目 `pricing-table` 的 `index.html` 标题里有 `pricing-table`
- **WHEN** 加 `--replace-name` 另存为 `my-pricing`，再用它创建项目 `shop-page`
- **THEN** 模板里的 `index.html` 含 `{{name}}`，且被登记在 `substitute` 里；新项目里的标题是 `shop-page`
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-15] 不带开关不替换
- **WHEN** 不加 `--replace-name` 另存
- **THEN** 模板文件里仍是原来的项目名，没有 `{{name}}`
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-16] 二进制文件不动
- 前提：项目里有一张图片，文件字节中碰巧含有项目名的字节序列
- **WHEN** 加 `--replace-name` 另存
- **THEN** 图片逐字节不变，没有登记进 `substitute`
- 验证：test

### Requirement: 手写模板放进约定位置就可用，并经过校验
放在 `~/.runyard/templates/<标识>/` 下的模板 MUST 无需重启就被发现；其 `template.json` 的 `id` MUST 等于文件夹名，否则 MUST 视为无效。用户模板的 `runner` MUST 是内置的七个运行器（第一版，Nuxt 运行器暂缓）之一，MUST NOT 自带运行器文件；不是则 `template lint` 报告 `runner-not-found`。用户模板 MUST 同样经过 `template lint` 的全部规则。无效的用户模板 MUST 仍出现在 `template list` 里并带 `valid: false`，MUST 不能用来创建项目：`runyard new` MUST 报 `TEMPLATE_INVALID`（2）。用户模板里自己写的安装方式 MUST 只展示，MUST NOT 被执行。
来源：PRD #prd-custom-templates；PRD #prd-runtime-requirements；PRD #prd-template-lint-test

#### Scenario: [TEMPLATES-CUSTOM-17] 手写一个模板
- 前提：在 `~/.runyard/templates/hello/` 手写 `template.json`（指向 `python` 运行器）和 `files/main.py`，管理进程已在运行
- **WHEN** 执行 `runyard template list --json`
- **THEN** 列表里有 `hello`，`source` 是 `"user"`，`valid` 是 `true`
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-18] 标识和文件夹名不一致
- 前提：文件夹叫 `hello`，`template.json` 里的 `id` 是 `hi`
- **WHEN** 执行 `template list --json` 和 `template lint hello`
- **THEN** 该模板 `valid` 为 `false`；lint 报告 `template-json-invalid`
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-19] 无效的模板不能用来创建
- 前提：用户模板指定了不存在的运行器
- **WHEN** 执行 `runyard new <该模板> demo --json`
- **THEN** 错误码 `TEMPLATE_INVALID`，退出码 2，没有创建文件夹
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-20] 不能自带运行器
- 前提：用户模板文件夹里放了一个自己的 `runner.json`
- **WHEN** 执行 `template lint`
- **THEN** 该文件不被当作运行器使用；模板的 `runner` 若不是内置运行器，报告 `runner-not-found`
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-21] 模板自带的安装方式只展示
- 前提：用户模板的 `requires` 里为 `zig` 写了 `install`，本机没有 zig
- **WHEN** 用它创建项目并运行
- **THEN** 因缺工具失败，提示里展示了该安装方式；应用没有执行它
- 验证：test

### Requirement: 用户模板与内置模板重名时内置的优先
用户模板的标识与内置模板相同时，系统 MUST 始终使用内置的那一个：`template list` 和 `new` 里该标识指向内置模板；用户的那个 MUST 在列表里标为无效（`valid: false`），`template lint` 对它报告 `template-id-reserved`。
来源：PRD #prd-custom-templates；PRD #prd-template-versions

#### Scenario: [TEMPLATES-CUSTOM-22] 手写了一个叫 react19 的模板
- 前提：`~/.runyard/templates/react19/` 里放了一个合法的用户模板
- **WHEN** 执行 `runyard new react19 demo`，再执行 `template list --json`
- **THEN** 创建出来的是内置的 React 19 项目；列表里 `react19` 的有效项是内置的，用户的那个 `valid` 为 `false`；`template lint` 对它报告 `template-id-reserved`
- 验证：test

#### Scenario: [TEMPLATES-CUSTOM-23] 用户模板之间没有重名
- 前提：另存两个不同标识的模板
- **WHEN** 列出模板
- **THEN** 两个都在，互不影响
- 验证：test
