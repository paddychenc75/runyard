# 加依赖、升级依赖

规则的出处是技术设计 §8.6（`docs/product/03-tech-design.md`）；这份手册是 §8.6.4 的十步，写成今天能照着跑的命令。

## 何时用

- 要给任何一个 `package.json` 加第三方包（`dependencies` 或 `devDependencies`）
- 要升级已有的依赖，包括审查 Renovate 提的升级 PR
- 要改 `pnpm-workspace.yaml` 里的统一版本表（catalog）

每一步的输出都要贴在 PR 描述里。

## 步骤

1. **先问要不要加。** 标准库或已有依赖能不能做；这个包最近 12 个月有没有人维护；许可证能不能用。带编译产物的原生模块不许加进 `packages/` 下的包。
2. **查版本和年龄。** 运行 `pnpm deps:lookup <包名>`：列出最近 10 个稳定版本、发布日期、距今天数，并对每个版本查 A（OSV）和 B（GitHub 公告库）。B 一列需要本机的 `gh` 已登录，显示“未查”时先登录再跑。脚本不可用时按技术设计 §8.6.1 规则 1 手动查。
3. **查 C（项目自己的公告页）。** 脚本最后一行会打印要运行的 `gh api repos/<owner>/<repo>/security-advisories` 命令；再读最近两个版本的发布说明，找“安全”“security”“CVE”字样。这一步不能省：A、B 有滞后，刚公布的公告常常只在 C。
4. **选版本**（规则见技术设计 §8.6.1）：
   - 发布满 15 天（pnpm 拒绝不满 14 天的，多留一天余量）
   - 最新大版本的 x.0.0 发布不满 90 天，就取上一个大版本里合格的最新补丁，前提是上一条线仍在维护
   - 运行时（Node、Electron）只用厂商仍在支持的版本线
   - 新版本正是修复某条已公布公告的版本时，可以不满 14 天就选（安全修复例外），但要满 72 小时并记下公告编号，见第 7 步
   - 多个候选都合格时，取最新的合格补丁，不取最旧的
5. **查兼容性。** `engines`（Node 范围）、`peerDependencies`、原生模块与 Electron 的 ABI。不兼容就回到第 4 步。
6. **安装。** 这个仓库的版本统一写在 `pnpm-workspace.yaml` 的 catalog 里，各 `package.json` 里写 `catalog:`：
   - 给某个包加：`pnpm add --save-catalog --filter <工作区包名> <包名>@<版本>`（开发依赖加 `-D`）
   - 给根目录加工具：`pnpm add --save-catalog -D -w <包名>@<版本>`
   - 升级：把 catalog 里那一行改成新的精确版本，再运行 `pnpm install`
   - 被应用和命令行在运行时导入的包写在 `dependencies`，只在开发时用的写在 `devDependencies`
   - pnpm 提示有未审核的安装脚本时：**不要直接批准。** 读这个包的脚本做什么，确认需要后在 `pnpm-workspace.yaml` 的 `allowBuilds` 里写 `包名: true`，并在 PR 里写理由；不确定就写 `false` 并停下来问
   - 安装报 `ERR_PNPM_NO_MATURE_MATCHING_VERSION`：选的版本（或它的某个间接依赖）不满 14 天。换一个版本或等几天，不要绕过
7. **例外。** 只有用了安全修复例外才做：在 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 里加一条**带版本号**的条目（如 `vite@7.3.7`），上面写注释说明公告编号；这个包的配套包（如各平台的二进制包）也要逐个加。例外条目和锁文件必须在同一个 PR 里：锁文件里有不满 14 天的版本而没有对应的例外条目时，`pnpm install --frozen-lockfile` 会直接失败（决策记录 0011）。条目满 14 天后不会自动消失，`minimumReleaseAgeExcludePrune` 只清掉锁文件已经不再用的版本，所以满 14 天后要手动删。pnpm 11 不认 `onlyBuiltDependencies`，放行安装脚本只用 `allowBuilds`。改这个文件之前先问负责人。
8. **记录。** 在 `docs/architecture/dependencies.md` 的表里加或改一行：包、选定版本、发布日期、查询日期、公告查询（A、B、C 各自的结果或公告编号）、为什么是这个版本。
9. **验证。** 依次运行，三条命令的输出都贴进 PR：
   - `pnpm check`（其中 `deps-policy` 查设置没被改松、版本是精确的；`deps-record` 查记录和 `package.json` 一致）
   - `pnpm audit --prod --audit-level high`
   - `pnpm audit signatures`
10. **升级也走同样的第 1 到 9 步。** Renovate 的 PR 不是例外：审 PR 时要重做第 3 步，不能只看它说“通过”。Electron、Vite、TypeScript、pnpm 升大版本必须附决策记录，写法见 `docs/guides/write-an-adr.md`。

## 禁止

- 手改 `package.json` 里的版本号；写 `^`、`~`、`latest` 或任何版本范围
- 设 `dangerouslyAllowAllBuilds`；不看脚本就批准安装脚本
- 因为“检查红了”而往 `security/allowlist.toml` 加条目却不写理由；允许清单只有三种情况能用（公告没有修复版本；修复版本要升大版本、会破坏上游包；只影响开发时工具、不进成品），每条都要写理由和到期日，加之前先问
- 用 `--force` 或 `--no-frozen-lockfile` 绕过检查；用 `minimumReleaseAgeExclude` 放行一个不是安全修复的版本

## 验证

- 第 9 步的三条命令都通过。
- `pnpm verify` 通过。
- `git diff` 里只有预期的改动：`pnpm-workspace.yaml`、相关的 `package.json`、`pnpm-lock.yaml`、`docs/architecture/dependencies.md`。

## 完成标准

- `docs/architecture/dependencies.md` 里有这个包的一行，版本与安装的一致，“公告查询”写了 A、B、C 三处的结果。
- PR 描述里贴了第 2、3、9 步的输出；用了安全修复例外的，写明了公告编号。
- 没有新增允许清单条目和年龄例外；确实需要的，负责人已经同意。

内置模板的依赖同样受这套规则管；模板目录建立时（M1），在这份手册里补上模板的做法。
