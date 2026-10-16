# 加一个内置模板

## 何时用

给应用加一个内置模板（规格 `openspec/specs/templates/format`；PRD #prd-template-engineering）。运行器还没有的，先照 `docs/guides/add-runner.md` 加运行器。

## 步骤

1. 建 `templates/builtin/<id>/`，文件夹名就是模板 `id`（小写字母、数字、连字符）。
2. 写 `template.json`：字段见 `templates/schema/template.schema.json`；`name`、`description` 中英文都写（`en` 必填，另写 `zh-CN`）；内置模板必须有 `maintainer`；`requires` 必填，不依赖工具写 `{}`，版本范围写下限和上限，如 `>=22.18 <27`。
3. 把要复制给用户的文件放进 `files/`；`entry` 和 `substitute` 里的路径相对 `files/`，用 `/`。
4. Node 类模板（`files/` 里有 `package.json`）还要有：精确版本的依赖（不写 `^`、`~`、`latest`，取值见技术设计 §8.6.5）、只放 `allowBuilds` 的 `pnpm-workspace.yaml`、锁文件。
5. `requires` 里用到的工具必须有 `templates/tools/<tool>.json`，或在该项里自己写 `install`。

## 重新生成锁文件

在系统临时目录里操作，不在仓库里装依赖。把 `files/` 复制过去，然后：

1. pnpm 的锁文件：`pnpm install --lockfile-only --config.minimumReleaseAge=20160`（间接依赖也要满 14 天；有安全修复例外的直接依赖再加 `--config.minimumReleaseAgeExclude=<包>@<版本>`，并写进 PR）。
2. npm 的锁文件：先把例外的包暂时改回上一个版本，`npm install --package-lock-only --before=<14 天前的日期>`，再改回来，用 `--before=<明天>` 再解析一次，间接依赖就仍然是满 14 天的。
3. 对两个锁文件跑 `pnpm audit`、`npm audit`，再逐个查间接依赖的发布日期和 OSV，结果记在 PR 里。

## 冒烟（服务类模板）

`pnpm template:smoke <模板标识>`（需要网络，不在 `pnpm test` 里）：真的安装、类型检查、构建（Vite 类）、启动、核对只监听 `127.0.0.1`、热更新或重启（`watch` 为 `restart` 的运行器）、停止、核对没有残留进程。服务端口走环境变量 `PORT` 的模板（`hono`），脚本也用 `PORT` 起它。声明范围的下限和上限各跑一次：`--node <那个版本的 node 绝对路径>`，并让对应版本的 pnpm 排在 `PATH` 前面；用 npm 的回退路径加 `--pm npm`。

## 冒烟（脚本类模板）

`pnpm template:smoke <模板标识>`（`node-ts`、`python`、`go`，不联网）：用本机真实的工具走一遍运行、语法错误、改正、标准输入和停止。新的脚本类模板在 `tooling/scripts/template-smoke-script.ts` 的 `programs` 里加它自己的几份源码。

## 验证

运行 `pnpm template:lint`：每个内置模板输出一行 `LintResult` JSON，有问题时退出码 2。同一项也在 `pnpm check` 里。

## 完成标准

`pnpm template:lint` 对新模板输出 `"ok":true`；`pnpm verify` 通过；冒烟测试（`template test`，另一个 issue）通过；PR 引用对应的规格场景。
