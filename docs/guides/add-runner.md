# 加一个运行器

## 何时用

给应用加一个运行器（`runner.json`），让模板通过 `runner` 字段引用它（规格 `openspec/specs/templates/format`；`docs/architecture/runner-format.md`）。

## 步骤

1. 建 `templates/runners/<id>/runner.json`，文件夹名就是运行器 `id`。
2. 字段见 `templates/schema/runner.schema.json` 和 `docs/architecture/runner-format.md`：`kind` 是 `server`、`static`、`oneshot` 之一；`server` 必须写 `ready`，`oneshot` 不写 `ready`，`static` 不写 `run`。
3. 命令一律写成字符串数组，不经过 shell：不写 `&&`、管道、`~`；端口用 `{port}`，监听地址用 `127.0.0.1`，不写 `--no-color`。
4. `stop` 只写 `mode`（`graceful` 或 `interrupt`）和 `graceMs`，不写信号名。
5. `needs` 里的工具必须有 `templates/tools/<tool>.json`。版本范围不写在运行器里，写在模板的 `requires`。

## 验证

建一个引用它的模板（或用已有模板）运行 `pnpm template:lint`：运行器自身的问题会以 `runner.` 开头的路径出现在该模板的结果里；没有任何模板引用它时，`pnpm template:lint` 也会单独校验它。

## 完成标准

`pnpm template:lint` 无报错；`pnpm verify` 通过；至少有一个内置模板引用它。
