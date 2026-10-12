# templates/

## 用途

随应用发布的数据文件：模板、运行器、工具定义。它们是数据，不是代码，格式的唯一出处是 `packages/protocol` 里的 zod 定义（规格 `openspec/specs/templates/format`）。
现状：只有 `schema/`；内置模板、运行器和工具定义随后续 issue 放进来。

## 对外暴露什么

不是代码包，没有入口。`schema/` 里的 JSON Schema 给写模板的人和编辑器用；程序读模板和运行器时用 `@runyard/protocol` 的 `validateTemplate`、`validateRunner`，不直接读这些 Schema。

## 本包特有的规则

- 加字段或改字段：改 `packages/protocol/src/template-file.ts`、`runner-file.ts`、`tool-definition.ts`，再运行 `pnpm generate`。已发布的格式是破坏性改动，要升 `formatVersion` 并写决策记录。
- 以后放进来的内置模板和运行器都要通过 `template lint`；模板依赖一律精确版本（技术设计 §8.6.5）。
- JSON Schema 描述“写什么”（带默认值的字段可以省略）。zod 里的 `refine` 类规则（相对路径不含 `..`、正则合法等）和 `template lint` 的具体规则（`command-shell-syntax`、`stop-signal-name` 等）JSON Schema 写不出来，以 `validateTemplate`、`validateRunner` 为准。

## 子目录地图

- `schema/template.schema.json`、`runner.schema.json`、`tool.schema.json`：**由 `pnpm generate` 从 zod 生成，不要手改**；`generated-fresh` 检查会拦住过期的。

## 测试

往返测试在 `tooling/scripts/json-schema.test.ts`：JSON Schema 与 zod 对同一批样例的结论必须一致。运行 `pnpm test --filter @runyard/tooling`。
