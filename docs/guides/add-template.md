# 加一个内置模板

## 何时用

给应用加一个内置模板（规格 `openspec/specs/templates/format`；PRD #prd-template-engineering）。运行器还没有的，先照 `docs/guides/add-runner.md` 加运行器。

## 步骤

1. 建 `templates/builtin/<id>/`，文件夹名就是模板 `id`（小写字母、数字、连字符）。
2. 写 `template.json`：字段见 `templates/schema/template.schema.json`；`name`、`description` 中英文都写（`en` 必填，另写 `zh-CN`）；内置模板必须有 `maintainer`；`requires` 必填，不依赖工具写 `{}`，版本范围写下限和上限，如 `>=22.18 <27`。
3. 把要复制给用户的文件放进 `files/`；`entry` 和 `substitute` 里的路径相对 `files/`，用 `/`。
4. Node 类模板（`files/` 里有 `package.json`）还要有：精确版本的依赖（不写 `^`、`~`、`latest`，取值见技术设计 §8.6.5）、只放 `allowBuilds` 的 `pnpm-workspace.yaml`、锁文件。
5. `requires` 里用到的工具必须有 `templates/tools/<tool>.json`，或在该项里自己写 `install`。

## 验证

运行 `pnpm template:lint`：每个内置模板输出一行 `LintResult` JSON，有问题时退出码 2。同一项也在 `pnpm check` 里。

## 完成标准

`pnpm template:lint` 对新模板输出 `"ok":true`；`pnpm verify` 通过；冒烟测试（`template test`，另一个 issue）通过；PR 引用对应的规格场景。
