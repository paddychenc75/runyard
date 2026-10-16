# 踩过的坑

第一批，来自模板冒烟和模板 CI（issue #54）。每条写：现象、原因、怎么做。以后踩到新的，加在最后，一条一段。

## 本机默认的 Node 不是 24

现象：`pnpm install` 或脚本报版本不对，或类型剥离的行为和 CI 不一样。原因：本机 shell 里默认的 `node` 可能是 25.x，仓库要求 `.node-version` 里的版本。做法：先 `nvm use`（读 `.node-version`），再跑任何 `node` / `pnpm` 命令。

## 冒烟里“下限”要用下限的工具，不是仓库自己的

现象：`pnpm template:smoke` 在本机过了，下限版本的 runner 上却挂。原因：脚本本身用仓库的 Node 跑，模板用哪个 `node` 由 `--node` 决定；pnpm 则看 `PATH` 里排在最前面的。做法：下限用 `--node <那个版本的 node 绝对路径>`，并让对应版本的 pnpm 排在 `PATH` 前面（CI 里 `template-smoke.yml` 就是这么做的）。Python、Go 直接看 `PATH` 里的 `python3`、`go`。

## 模板 CI 的下限是“X.Y.0”

现象：`setup-go` 给 `1.26` 会装成 1.26 线的最新补丁版，下限没有真的测到。做法：矩阵里下限一律补成 `X.Y.0`（Node 22.18.0、Python 3.12.0、Go 1.26.0、pnpm 10.34.6），由 `tooling/ci/template-matrix.ts` 从模板 `requires` 的下界算出，不要手写在工作流里。

## 联网安装只放在模板 CI 和每晚任务里

现象：把真实安装依赖的测试放进 `pnpm test`，离线或注册表慢时整个测试挂。做法：联网的冒烟只经 `pnpm template:smoke`（别名 `pnpm test:template`），只在 `templates.yml`、`templates-nightly.yml` 里跑，不进 `pnpm test` 和 `pnpm verify`。

## 新增模板不用改工作流

现象：以为要给每个新模板在工作流里加一行。做法：把文件夹放进 `templates/builtin/` 即可，矩阵按目录和 `requires` 生成；只有出现新的工具（`node`、`pnpm`、`python`、`go` 之外）才要改 `tooling/ci/template-matrix.ts` 的 `TOOLS` 和 `tooling/ci/template-toolchains.json`，脚本会明确报错指向它们。

## 脚本类模板的几个真实坑

- Python：不设 `PYTHONDONTWRITEBYTECODE=1` 项目里会出现 `__pycache__`；中文输出依赖 `PYTHONUTF8=1`。
- Go：`go.mod` 要求更新的 Go 时必须 `errored` 而不是自动下载工具链（`GOTOOLCHAIN=local`）；每次运行用单独的 `GOTMPDIR`，停止后不能留下 `go-build*`。
- 这些由 `pnpm template:smoke node-ts|python|go` 在 runner 上用真实工具验证，不是假平台的单元测试能覆盖的。
