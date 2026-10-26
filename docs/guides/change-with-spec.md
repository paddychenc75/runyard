# 用规格驱动一次改动

流程的唯一出处是这份手册（技术设计 §9.6.6 到 §9.6.9）；三个 skill（`propose-change`、`apply-change`、`archive-change`）只指到这里的步骤。规格放在 `openspec/specs/`，只通过 `pnpm spec …` 调用 OpenSpec，不运行 `openspec init` 或 `openspec update`，不让它生成任何文件，不在 `openspec/` 里建 `AGENTS.md`。

## 何时用

判断标准只有一个问题：**用户或智能体从外面看得见的行为变了吗？**（界面上的行为、命令行的输出和退出码、文件格式、时间上的保证、错误提示）

| 情况 | 怎么做 |
| --- | --- |
| 行为变了或新增了行为 | 完整流程（下面的步骤） |
| 修缺陷，规格里已有对应场景 | 不建改动文件夹：先写一个标题带该场景编号的失败测试，再修；PR 标题 `fix(...)` |
| 修缺陷，规格里没有对应场景 | 简化流程：改动里只有规格增量（补一个场景）和任务，提案三行，批准单只有那一个场景 |
| 重构、升级依赖、改文档、改工具和 CI、补测试 | 不走流程；PR 标题的 type 是 `refactor`、`chore`、`docs`、`ci`、`test`、`build` 之一 |
| 改文案、改样式，行为不变 | 不走流程；PR 带 `no-spec` 标签并写一句原因 |
| 技术验证（M0a）的一次性代码 | 不走流程，结论写成决策记录 |
| 拿不准 | 走简化流程：多写一个场景的成本远小于漏掉一次行为变化 |

## 步骤

1. **用户**用一两句中文说要什么。
2. **主智能体**运行 `propose-change`：读相关的 PRD 小节和 `pnpm spec show <能力路径> --type spec`；不清楚的先问用户（最多三个问题）；在分支上的 `openspec` 目录下建 `changes/<改动名>/`（`proposal.md`、`tasks.md`、`specs/<能力路径>/spec.md` 增量），改动名用动词开头（`add-run-ownership`）；运行 `pnpm spec validate <改动名> --strict`。
3. **`spec-reviewer`**（只读子智能体）检查增量：与 PRD 是否矛盾、每个场景能否测、有没有实现细节、用词是否在术语表里。主智能体改完再往下。
4. **主智能体**在对话里给用户一页批准单，然后**停下**。批准单全中文、固定五段：改动名；为什么（两三句）；改什么；要求和场景（每个场景一行，如“新增 · 关闭标签页即停止运行 / `[RUN-OWNERSHIP-01]` 关掉正在运行的标签页 → 3 秒内停止，端口可重新使用”）；不做什么；最后一行“要不要改 PRD：不用（来源 PRD #prd-…）；任务：N 条，涉及哪几个包”。
5. **用户**回答“同意”或说哪里不对。没有批准不许写实现代码。
6. **主智能体**运行 `apply-change`，按任务清单逐条实现，每个场景先写测试，测试标题带场景编号，做一条勾一条。交给子智能体做时，交代里必须写三样：改动名；“先读根 `AGENTS.md`、`docs/guides/change-with-spec.md`、`changes/<改动名>/`（在 `openspec` 目录下）里的全部文件”；它负责的任务编号。子智能体不许改 `openspec/specs/`，也不许运行 `pnpm spec archive`。
7. 实现中发现规格写错或漏了：回头改增量。改动大就回到第 4 步再给用户看；改动小就在 PR 描述里说明。与 PRD 矛盾时停下报告，不自己选。
8. **主智能体**运行 `archive-change`：`pnpm verify`；`pnpm spec archive <改动名> --yes` 把增量合并进 `openspec/specs/`，改动文件夹随之消失；把提案的“为什么”和“改什么”写进 PR 描述，重要的技术决定写决策记录（`docs/guides/write-an-adr.md`）。
9. **用户**看 PR 描述和 `openspec/specs/` 的差异，合并。只允许 squash 合并，所以 `main` 里不会有改动文件夹。

### 规格怎么写

- 六个英文结构词保持英文：`Requirement`、`Scenario`、`WHEN`、`THEN`、`MUST`、`ADDED / MODIFIED / REMOVED Requirements`；其余全部中文。
- 能力路径是 `<领域>/<能力>`，全小写加连字符，取持久的行为（`run/ownership`），不取某次要做的事。
- 每条要求末尾单独一行“来源：PRD #prd-…”；没有 PRD 出处的写“来源：ADR NNNN”或“来源：实现细节”。要改变 PRD 写着的行为，先改 PRD（需要负责人同意），同一个 PR 里规格跟上。
- 每个场景标题以编号开头，`run/ownership` 的第 3 个是 `[RUN-OWNERSHIP-03]`；编号起了就不改、不复用，删掉的编号作废；最后一行写“- 验证：test”或“- 验证：manual（原因）”。
- 只写行为，不写类名、函数名、库的选择。把实现整个换一种写法，这句话还成立吗？成立的才是规格；解释“为什么这样写”的是决策记录；讲“先做什么后做什么”的是手册。
- 常用命令：`pnpm spec list --specs`、`pnpm spec show <能力路径> --type spec`、`pnpm spec validate --all --strict`。

### 待实现清单

规格先于代码批准，所以标了“验证：test”但还没有测试的场景登记在 `tooling/checks/spec-pending.txt`。追踪正式单元/进程测试的 `.test.ts(x)`，以及桌面 Playwright 配置下 `apps/desktop/e2e/*.e2e.ts` 的测试标题；`.measure.ts`、`.fixture.ts` 和普通脚本不算测试覆盖。清单只许缩小：实现某个场景时，在同一个 PR 里写标题带 `[编号]` 的测试，并把它从清单里删掉（`spec-trace` 会因为“已有测试还留在清单里”而变红）。

## 验证

- `pnpm spec validate --all --strict --no-interactive` 通过（`pnpm check` 里的 `spec-validate`）。
- `pnpm check` 里的 `spec-trace`：编号唯一、前缀与能力路径一致、每个 `test` 场景有测试或在待实现清单里、`manual` 写了原因；`prd-refs`：每条要求有“来源”一行且 PRD 锚点存在。
- CI 的 PR 上还跑 `spec-changes-closed`（`openspec` 目录下的 `changes` 里不能留未合并的改动）和 `spec-touch`（改了 `packages/*/src` 或 `apps` 下各应用的 `src` 的 `feat` PR 必须动 `openspec/specs/`，或带 `no-spec` 标签）。
- 这些检查只能证明“有测试提到了这个编号”，不能证明测试真的验证了场景，那一点靠 `spec-reviewer` 和评审抽查。

## 完成标准

- 用户批准过批准单；PR 开出前 `openspec` 目录下的 `changes` 里没有这次的改动文件夹。
- 每个新增或修改的 `test` 场景都有标题带编号的测试；已实现的场景不在待实现清单里。
- PR 描述写了提案的“为什么”和“改什么”，重要的技术决定有决策记录。
- `pnpm verify` 通过并贴了结果。
