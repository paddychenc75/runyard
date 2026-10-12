# 加一个跨进程命令

协议的出处是 `docs/architecture/protocol.md` 和 `protocol-methods.md`；管理进程一侧的接缝在 `packages/supervisor/AGENTS.md`。“命令”指客户端（桌面应用、命令行）发给管理进程的一个方法，如 `playground.rename`。

## 何时用

- 要新增一个客户端调用管理进程的方法，或改已有方法的入参、出参、可能返回的错误
- 要新增一个管理进程推给客户端的事件

方法名和事件名各只定义一次（`packages/protocol` 的登记表），别处不再写一遍字符串。只加新方法、新的可选字段不升协议版本；改已有方法的入参出参是破坏性改动，要升版本并写决策记录（`docs/guides/write-an-adr.md`）。

## 步骤

1. **先看规格。** 行为在 `openspec/specs/` 里有没有批准的场景；没有就停下来，规格批准之前不写行为代码。规格没定形状的方法只占名字（`methods-reserved.ts`，`status: 'reserved'`），管理进程回 `NOT_SUPPORTED`。
2. **登记方法。** 在 `packages/protocol/src/methods-<组>.ts` 加一项：`params`、`result` 用 zod 写，入参一律是对象（没有字段就用 `emptySchema`），`errors` 列出除 `USAGE` 和 `INTERNAL` 之外可能返回的错误码；需要新错误码先在 `errors.ts` 登记（再给 `packages/i18n` 补两种语言的文案，见 `docs/guides/add-ui-string.md`）。事件加在 `events.ts`，并指明所属主题。
3. **补协议测试。** 在 `methods.test.ts`（或 `events.test.ts`）的样例表里加合法与非法样例，运行 `pnpm generate` 更新 `docs/reference/`。
4. **写处理函数。** 在 `packages/supervisor` 的 `extend(api)` 返回的 `handlers` 里按方法名登记；参数和返回值的类型由登记表推出，不手写。失败用 `methodFailure(code, params, debug)` 抛出；`debug` 是一句英文，只进日志。参数已经按登记表校验过，不再重复校验；返回值也会被校验，不合就是缺陷。会改共享文件的方法，把 `DATA_FROM_NEWER_VERSION` 放进它的 `errors`。状态变化用 `api.publish(event, data)` 推送；运行个数变了调 `api.notifyRunsChanged()`。
5. **写测试。** 管理进程一侧用 `supervisor-harness.test.ts` 的假平台和 `TestClient` 走真的连接：断言成功的出参、每个错误码的 `code` 和 `params`、非法入参得 `USAGE`、多出的未知字段被忽略。每个 `验证：test` 场景的测试标题带编号，如 `[RUN-OWNERSHIP-01]`。
6. **接客户端。** 在客户端包（`client`）加带类型的调用，类型取自登记表；命令行的命令和文案在命令行包（`cli`）。这两个包建立后，把它们的路径补进这一步。桌面应用的界面进程只能调白名单内的方法，`supervisor.shutdown` 一类不在白名单。

## 验证

- `pnpm test --filter @runyard/protocol --filter @runyard/supervisor`
- `pnpm generate` 之后 `git diff docs/reference/` 里只有预期的改动，`pnpm check`（含 `generated-fresh`、`i18n-codes`）通过
- 手动试：用测试里的 `TestClient` 或原始 socket 走一遍握手和这个方法，确认口令没有出现在连接上

## 完成标准

- 登记表、处理函数、客户端调用、测试、生成的参考文档在同一个 PR 里
- 方法名、事件名在代码里只出现在登记表和测试里
- 没有句子字段；错误只有代码加参数加英文 `debug`
- 没有升协议版本的新增，或者升了版本并附了决策记录
