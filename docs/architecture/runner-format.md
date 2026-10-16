# 运行器：`runner.json` 字段与行为

运行器是随应用发布的数据文件，说明“怎么安装、启动、判断就绪、停止”；模板只指定用哪个运行器，自己不含命令。格式的唯一出处是 `@runyard/protocol` 里的 zod 定义（`runner-file.ts`），由它生成 `templates/schema/runner.schema.json`；本篇是写前说明，校验规则见 `validate-runner.ts`。状态机见 [run-state-machine.md](run-state-machine.md)。

出处：技术设计 §4.4、§4.5、§4.8、§7.2 第 1 到 3 行、第 13 行；决策记录 [0006](decisions/0006-stop-process-tree.md)、[0008](decisions/0008-log-capture-and-cleaning.md)、[0011](decisions/0011-toolchain-facts-audit.md)；PRD #prd-template-engineering、#prd-first-templates、#prd-script-projects。

## 1. 字段到行为的映射

| 字段 | 行为 |
| --- | --- |
| `formatVersion`、`id` | 格式版本（整数）；运行器 id，模板的 `runner` 字段引用它 |
| `kind` | `server`：起进程、等就绪、有端口。`static`：管理进程自己托管静态页面，不起进程。`oneshot`：脚本，起进程、等退出、没有端口 |
| `needs` | 需要的工具名；`{ "anyOf": [...] }` 表示任选其一（如 pnpm 或 npm）。版本范围不写在这里，写在模板的 `requires` |
| `setup` | 安装依赖。`inputs` 没变且 `stamp` 文件在就跳过；`variants` 按选中的包管理器给命令；优先用本机缓存（`--prefer-offline`）；`errors` 里每条是“正则加原因”，匹配输出区分 `DEPS_OFFLINE`、`RUNTIME_MISSING` 等，匹配对启动阶段的输出同样生效；无匹配则 `SETUP_FAILED` |
| `run.command` | **参数数组，不经过 shell。** 第一个词是工具名时换成检测到的真实路径。占位符 `{port}` `{entry}` `{dir}` `{name}` 按元素替换。写了 `&&`、管道、`~` 的运行器在 `template lint` 里报错 |
| `run.env`、`run.stdin` | 运行器自己的环境变量（叠在全局环境之上）；脚本是否接收标准输入 |
| `check` | 只有脚本用，重新运行前的语法检查；非 0 退出则不运行、保留上次输出、标 `stale`。`.ts` 脚本用 `stripTypeScriptTypes`（`enum` 报 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`，语法错报 `ERR_INVALID_TYPESCRIPT_SYNTAX`），**不要用 `node --check`**（0011） |
| `ready` | 收到 HTTP 响应（`http`）、端口能连上（`port`）、或日志出现某行（`log`）；`slowAfterMs` 默认 30000，只影响界面“较慢”字样 |
| `preview` | `web`（页面）、`request`（请求面板）、`console`（输出） |
| `watch` | `none`：框架自己热更新。`rerun`：脚本，文件变化后重跑。`restart`：服务，由管理进程停了再起，端口不变，期间状态 `reloading` |
| `stop` | `{ mode: 'graceful' \| 'interrupt', graceMs }`，`graceMs` 默认 2000；**不写信号名**，接口里没有信号，手段由平台层定（Windows 没有信号，这是接口不写信号名的原因） |
| `detect`、`actions` | 第一版不使用，为以后留着 |

写运行器时的硬规则（AGENTS.md 约定与设计一致）：地址一律 `127.0.0.1`；命令是数组；能直接用 `node` 跑入口文件就不经包管理器（K2 实测：Windows 上 `pnpm exec vite` 是 4 层进程，直接跑是 1 层；Windows 以后，工具多为 `.cmd` 垫片，由平台层解析）；不传 `--no-color`（Vite、Next 会报错退出）；Vite 加 `--clearScreen false`。

## 2. 完整示例一：`react19`（运行器 `vite`，react18、vue3 共用）

相对最初方案已按 M0a 结果修正：参数数组、`--host 127.0.0.1`、不加 `--no-color`、加 `--clearScreen false`、`graceMs` 2000、不写 `BROWSER`。

```json
{
  "formatVersion": 1,
  "id": "vite",
  "kind": "server",
  "needs": ["node", { "anyOf": ["pnpm", "npm"] }],
  "setup": {
    "inputs": ["package.json", "pnpm-lock.yaml", "package-lock.json"],
    "stamp": "node_modules/.runyard-setup.json",
    "variants": {
      "pnpm": { "command": ["pnpm", "install", "--prefer-offline"] },
      "npm":  { "command": ["npm", "install", "--prefer-offline", "--no-audit", "--no-fund"] }
    },
    "errors": [
      { "match": "ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY", "reason": "SETUP_FAILED" },
      { "match": "ERR_PNPM_IGNORED_BUILDS", "reason": "SETUP_FAILED" },
      { "match": "ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION", "reason": "SETUP_FAILED" },
      { "match": "ERR_PNPM_NO_OFFLINE_TARBALL|ERR_PNPM_NO_OFFLINE_META|ERR_PNPM_META_FETCH_FAIL|ENOTCACHED|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET", "reason": "DEPS_OFFLINE" },
      { "match": "VCRUNTIME140|The specified module could not be found", "reason": "RUNTIME_MISSING" }
    ]
  },
  "run": {
    "command": ["node", "node_modules/vite/bin/vite.js",
                "--port", "{port}", "--strictPort", "--host", "127.0.0.1", "--clearScreen", "false"]
  },
  "ready": { "http": { "path": "/" }, "slowAfterMs": 30000 },
  "preview": { "type": "web", "path": "/" },
  "watch": { "mode": "none" },
  "stop": { "mode": "graceful", "graceMs": 2000 }
}
```

模板侧：`"runner": "vite"`，`requires` 里 node 与 pnpm 的版本范围（pnpm 带回退 npm）；模板同时带两种锁文件，创建时只复制选定的那个。匹配串已在 #51 对着真实输出校对（pnpm 11.28.0、npm 11.20.0，2026-10-16，macOS）：实测不可达注册表时输出里没有 `ENOTFOUND` 一类字样（本机经代理，也许与此有关），pnpm 的真实输出是 `ERR_PNPM_META_FETCH_FAIL` 和 `ERR_PNPM_NO_OFFLINE_META`，已补上；`VCRUNTIME140` 一条是 Windows 的字样，macOS 上无法核对。三个 pnpm 错误码已加进匹配表（上面的前三条，先于 `DEPS_OFFLINE` 一条，以免被它抢先匹配）：`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`（无终端时要清空 `node_modules` 却无处确认，带 `--config.confirmModulesPurge=false` 重试，不设 `CI=1`）、`ERR_PNPM_IGNORED_BUILDS`、`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`（0011）。

## 3. 完整示例二：`python`（运行器 `python-file`）

```json
{
  "formatVersion": 1,
  "id": "python-file",
  "kind": "oneshot",
  "needs": ["python"],
  "check": {
    "command": ["python", "-c",
      "import ast,sys;ast.parse(open(sys.argv[1],encoding='utf-8').read(),sys.argv[1])",
      "{entry}"],
    "timeoutMs": 5000
  },
  "run": {
    "command": ["python", "-u", "{entry}"],
    "env": { "PYTHONDONTWRITEBYTECODE": "1" },
    "stdin": true
  },
  "preview": { "type": "console" },
  "watch": { "mode": "rerun", "paths": ["**/*.py"],
             "ignore": [".venv/**", "__pycache__/**"], "debounceMs": 300 },
  "stop": { "mode": "graceful", "graceMs": 2000 }
}
```

要点：`python` 是工具名，实际执行的是检测到的解释器（macOS 上常是 `python3`；Windows 以后：可能是 `python` 或 `py -3`，商店的占位 `python.exe` 判为未安装）。输出走管道不走伪终端，所以保留 `-u`；`PYTHONUTF8=1` 和 `PYTHONUNBUFFERED=1` 已由管理进程给**所有**运行加上（0008），不再写在这个运行器里（Windows 上不加时 Python 写中文直接崩溃，所以所有系统统一加）。语法检查用 `ast.parse`，不写 `__pycache__`，语法错时退出码为 1。P0 的 Python 模板没有第三方依赖，不用 uv；运行时关闭 uv 的自动下载。

## 4. Go 的特别之处

| 点 | 做法 |
| --- | --- |
| 停止 | `stop.mode` 用 `interrupt`：`go run` 收到中断才删自己的临时目录；用 SIGTERM、SIGKILL 或 `taskkill` 结束会每次留下一个 `go-build*` 目录 |
| 临时目录 | 管理进程给每次运行单独设 `GOTMPDIR`，停止后删除；强制结束留下的目录靠这个清（0006） |
| 版本 | 检测命令是 `go version`（没有 `--version`）；运行时关闭 Go 的自动下载 |
| 语法检查 | 脚本类 `check` 用 `gofmt -e -l`（语法错退出码 2） |

## 未定

已定（#20）：`ready` 的三种写法是 `{ "http": { "path" } }`、`{ "port": {} }`、`{ "log": { "match" } }`，`slowAfterMs` 与它们同级；`watch` 的 `paths`、`ignore`、`debounceMs` 保留为可选字段；`needs` 里 `anyOf` 至少一项；`setup.variants` 的键是包管理器的工具标识；`setup.errors` 缺省为空；`run.stdin` 缺省为否；`static` 不写 `run`，`server` 和 `oneshot` 必须写。工具定义的字段见 `packages/protocol/src/tool-definition.ts`（`id`、`executables?`、`supported`、`detect { args, pattern }`、`install.darwin { url, versionManagers?, homebrew? }`），工具链检测需要别的字段时在那里加。`template.json` 的字段见 `template-file.ts`。

1. 十一个模板各自的运行器 json（M1 随模板逐个落地时定）；`next16` 加 `-H 127.0.0.1`、`nuxt` 加 `--host 127.0.0.1` 等已在设计 §7.2 之后点名。
