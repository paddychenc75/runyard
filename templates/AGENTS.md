# templates/

## 用途

随应用发布的数据文件：模板、运行器、工具定义。它们是数据，不是代码，格式的唯一出处是 `packages/protocol` 里的 zod 定义（规格 `openspec/specs/templates/format`）。
现状：目录骨架、六份工具定义，内置模板 `html`（运行器 `static`，#50）、`react19`、`react18`、`vue3`（共用运行器 `vite`，#51）和 `hono`（运行器 `hono`，#53）已有；其余内置模板和运行器随后续 issue 放进来。`next16`、`nuxt4`、`nuxt3`（#53 的另三个）暂缺，原因见 #53。

## 对外暴露什么

不是代码包，没有入口。`schema/` 里的 JSON Schema 给写模板的人和编辑器用；程序读模板和运行器时用 `@runyard/protocol` 的 `validateTemplate`、`validateRunner`，不直接读这些 Schema。

## 本包特有的规则

- 加字段或改字段：改 `packages/protocol/src/template-file.ts`、`runner-file.ts`、`tool-definition.ts`，再运行 `pnpm generate`。已发布的格式是破坏性改动，要升 `formatVersion` 并写决策记录。
- 以后放进来的内置模板和运行器都要通过 `template lint`；模板依赖一律精确版本（技术设计 §8.6.5）。
- JSON Schema 描述“写什么”（带默认值的字段可以省略）。zod 里的 `refine` 类规则（相对路径不含 `..`、正则合法等）和 `template lint` 的具体规则（`command-shell-syntax`、`stop-signal-name` 等）JSON Schema 写不出来，以 `validateTemplate`、`validateRunner` 为准。

## 子目录地图

- `builtin/<id>/`：内置模板，`template.json` 加 `files/`（现在有 `html`、`react19`、`react18`、`vue3`、`hono`）。文件夹名必须等于模板 `id`。步骤见 `docs/guides/add-template.md`。
- `runners/<id>/runner.json`：运行器（现在有 `static`：不起进程，页面由管理进程托管，见 `packages/supervisor/AGENTS.md`；`vite`：`node` 直接运行 Vite 的入口文件，不经包管理器；`hono`：`node` 直接运行模板入口 `{entry}`（Node 22.18 起可直接运行 `.ts`），端口走环境变量 `PORT`，`watch.mode` 是 `restart`，预览是请求面板）。文件夹名必须等于运行器 `id`。步骤见 `docs/guides/add-runner.md`。
- `tools/<tool>.json`：工具定义，node、npm、pnpm、python、uv、go。文件名必须等于 `id`；`core` 的 `parseToolDefinitions` 读成工具链检测的 `definitions`。安装命令和官网链接只展示，应用从不执行；各系统分开放在 `install.<系统>` 下，第一版只有 `darwin`。
- `schema/template.schema.json`、`runner.schema.json`、`tool.schema.json`：**由 `pnpm generate` 从 zod 生成，不要手改**；`generated-fresh` 检查会拦住过期的。

## 检查与 lint

`pnpm template:lint`（也在 `pnpm check` 里，叫 `template-data`）检查 `tools/`、`runners/`、`builtin/` 三处。判定逻辑是 `@runyard/core` 的 `lintTemplate`：模板文件夹、运行器、已知工具由调用方读好交进去，返回 `LintResult`（规则见规格 templates/format）。内置模板不通过，`pnpm check` 就失败。

## Vite 类模板（react19、react18、vue3）

- 三个模板共用运行器 `vite`；版本固定在技术设计 §8.6.5 的表里，每个直接依赖在 `docs/architecture/dependencies.md` 有一行。锁文件 `pnpm-lock.yaml` 和 `package-lock.json` 都带（没有 pnpm 时回退 npm）。重新生成锁文件的办法见 `docs/guides/add-template.md`；不要手改，也不要让它们进根工作区的锁文件。
- Vite 的报错框颜色去不掉，Vite 也不支持 `--no-color`：写在每个模板的 `description` 和 `files/README.md` 里；运行器因此不传 `--no-color`。
- `setup.errors` 的特征串对着真实输出校对过（pnpm 11.28.0、npm 11.20.0，2026-10-16）。不可达注册表和离线时 pnpm 的真实输出是 `ERR_PNPM_META_FETCH_FAIL`、`ERR_PNPM_NO_OFFLINE_META`（没有出现 `ENOTFOUND`），所以它们和 `ECONNREFUSED`、`ECONNRESET` 一起归 `DEPS_OFFLINE`；`VCRUNTIME140` 一条是 Windows 上的字样，macOS 上无法核对，留给做 Windows 时。
- 这些模板自带的依赖不进仓库工作区，仓库里不安装它们。真实安装加启动的冒烟要联网，用 `pnpm template:smoke`，不在 `pnpm test` 里（模板 CI 接入是 #54）。

## Hono 模板（hono）

- 监听地址写在模板自己的代码里（`hostname: "127.0.0.1"`，技术设计 §7.2 之后的模板说明）；运行器命令里没有地址参数，端口由管理进程放进环境变量 `PORT`。冒烟会用 `lsof` 核对监听地址，改成 `0.0.0.0` 就会失败。
- 入口是 `src/index.ts`，由 Node 直接运行（不编译），所以只能用可擦除的语法（`tsconfig.json` 开了 `erasableSyntaxOnly`）；Node 下限因此是 22.18。
- 两个依赖（`hono`、`@hono/node-server`）的版本是技术设计 §8.6.5 定的，没有依赖需要安装脚本，`pnpm-workspace.yaml` 里 `allowBuilds` 为空。
- 保存后的重启由管理进程做（规格 TEMPLATES-RUNNERS-36 至 38，`supervisor` 的事）；本目录只声明 `watch.mode: restart`。

## 测试

往返测试在 `tooling/scripts/json-schema.test.ts`：JSON Schema 与 zod 对同一批样例的结论必须一致。运行 `pnpm test --filter @runyard/tooling`。工具定义和仓库数据的测试在 `tooling/scripts/template-data.test.ts`，lint 规则的测试在 `packages/core/src/templates/`。`vite` 运行器用真实的 `runner.json` 和 `react19` 的 `template.json` 跑准备阶段的测试在 `packages/core/src/prepare/vite-runner.test.ts`，`hono` 的在同目录的 `hono-runner.test.ts`。
