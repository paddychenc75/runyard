# templates/

## 用途

随应用发布的数据文件：模板、运行器、工具定义。它们是数据，不是代码，格式的唯一出处是 `packages/protocol` 里的 zod 定义（规格 `openspec/specs/templates/format`）。
现状：目录骨架、六份工具定义，以及第一个内置模板 `html` 和运行器 `static` 已有（#50）；其余内置模板和运行器随后续 issue 放进来。

## 对外暴露什么

不是代码包，没有入口。`schema/` 里的 JSON Schema 给写模板的人和编辑器用；程序读模板和运行器时用 `@runyard/protocol` 的 `validateTemplate`、`validateRunner`，不直接读这些 Schema。

## 本包特有的规则

- 加字段或改字段：改 `packages/protocol/src/template-file.ts`、`runner-file.ts`、`tool-definition.ts`，再运行 `pnpm generate`。已发布的格式是破坏性改动，要升 `formatVersion` 并写决策记录。
- 以后放进来的内置模板和运行器都要通过 `template lint`；模板依赖一律精确版本（技术设计 §8.6.5）。
- JSON Schema 描述“写什么”（带默认值的字段可以省略）。zod 里的 `refine` 类规则（相对路径不含 `..`、正则合法等）和 `template lint` 的具体规则（`command-shell-syntax`、`stop-signal-name` 等）JSON Schema 写不出来，以 `validateTemplate`、`validateRunner` 为准。

## 子目录地图

- `builtin/<id>/`：内置模板，`template.json` 加 `files/`（现在只有 `html`）。文件夹名必须等于模板 `id`。步骤见 `docs/guides/add-template.md`。
- `runners/<id>/runner.json`：运行器（现在只有 `static`：不起进程，页面由管理进程托管，见 `packages/supervisor/AGENTS.md`）。文件夹名必须等于运行器 `id`。步骤见 `docs/guides/add-runner.md`。
- `tools/<tool>.json`：工具定义，node、npm、pnpm、python、uv、go。文件名必须等于 `id`；`core` 的 `parseToolDefinitions` 读成工具链检测的 `definitions`。安装命令和官网链接只展示，应用从不执行；各系统分开放在 `install.<系统>` 下，第一版只有 `darwin`。
- `schema/template.schema.json`、`runner.schema.json`、`tool.schema.json`：**由 `pnpm generate` 从 zod 生成，不要手改**；`generated-fresh` 检查会拦住过期的。

## 检查与 lint

`pnpm template:lint`（也在 `pnpm check` 里，叫 `template-data`）检查 `tools/`、`runners/`、`builtin/` 三处。判定逻辑是 `@runyard/core` 的 `lintTemplate`：模板文件夹、运行器、已知工具由调用方读好交进去，返回 `LintResult`（规则见规格 templates/format）。内置模板不通过，`pnpm check` 就失败。

## 测试

往返测试在 `tooling/scripts/json-schema.test.ts`：JSON Schema 与 zod 对同一批样例的结论必须一致。运行 `pnpm test --filter @runyard/tooling`。工具定义和仓库数据的测试在 `tooling/scripts/template-data.test.ts`，lint 规则的测试在 `packages/core/src/templates/`。
