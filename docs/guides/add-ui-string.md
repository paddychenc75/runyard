# 加或改一条给人看的文字

规则的出处是技术设计 §6.8（`docs/product/03-tech-design.md`）；这份手册是它“手册要点”的八步，现在只写命令行的部分，界面的部分（`<T>`、`useFormat()`、`Truncate`、伪语言）随 M2 的界面包补进来。

## 何时用

- 命令行要新增或修改一句给人看的话：错误、状态和进度行、表格表头、`--help` 的文字
- 新增了错误码或提示码，要给它写文案
- 要新增一种数字、大小、时长的写法（先看 `packages/i18n/src/format.ts` 有没有）

代码里不写中文或英文句子；管理进程、`core`、`client`、`platform`、`protocol` 只发“代码加参数”，不产生句子。

## 步骤

1. **定组。** 命令的说明、进度行和 `--help` 放 `cli`；错误和提示走 `errors.<代码>.*`、`notice.<代码>`；运行状态走 `runState.<值>`；数字、时长、相对时间的文案在 `format`。多个地方都用的动作词放 `common`。先在 `packages/i18n/locales/zh-CN/` 里搜有没有现成的键，有就复用。
2. **起键名。** `<组>.<区域>.<元素>`，小驼峰，最多四段；结尾用固定的词（`.title` `.body` `.action` `.label` `.placeholder` `.hint` `.aria` `.tooltip`）。错误码和提示码的键保持代码原样（`errors.NAME_EXISTS.title`）。修改已有文案只改值不改键；意思变了才换新键并删掉旧键。
3. **写中文。** 在 `packages/i18n/locales/zh-CN/<组>.json` 加一行，格式是一层 JSON，键是完整的点分名字，值是 ICU 文案。用词查 `docs/glossary.md`；中文和英文字母、数字之间留一个半角空格；数量写成 `{count, plural, other {# 分钟}}`，不在代码里判断单复数；废纸篓、访达写 `{term_trash}`、`{term_fileManager}`（由文案系统按系统自动填，调用的人不传，定义在 `platform.<名>`）。
4. **写英文。** 在 `locales/en/<组>.json` 写同一个键，参数名和中文完全一致；英文要 `one` 和 `other` 两个复数类别。带参数的文案在 `locales/notes/<组>.json` 写备注（每个参数是什么）。
5. **生成类型。** 运行 `pnpm i18n:build`，更新 `packages/i18n/generated/messages.d.ts`。错误码、提示码、运行状态的键不在 JSON 生成物里，它们由 `protocol` 的登记表推出：先在 `packages/protocol` 登记代码和参数，再写 `errors.<代码>.*` 的文案，参数名必须和登记一致。
6. **在代码里用。** `t('键', { 参数 })` 得到 `Localized`；写错键、漏传参数、参数类型不对都是类型错误。数字、大小、时长、相对时间只用 `createFormat(...)` 的函数，不自己拼单位，不直接调 `Intl`。命令行的语言由 `cli` 读出 `--lang`、`RUNYARD_LANG`、`cli.json` 的 `lang` 三个值，交给 `resolveCliLocale({ flag, env, saved })`。
7. **写测试。** 断言键和错误码，不断言显示出来的文字：用 `createTestTranslator()`，它把每条文案渲染成 `⟦键|参数=值⟧`；核心和管理进程的测试断言 `err.code`。只有 `format.ts` 的单元测试断言真实文字。
8. **验证。** 运行 `pnpm verify`；PR 描述里贴出新增和修改的中文原文；改了命令行文字的，另贴 `--lang zh-CN` 下的一段输出。

## 验证

- `pnpm check` 里的国际化检查会指出问题，每条报错写明哪里错、怎么改：`i18n-keys`（两种语言的键和参数、复数类别、备注、字数上限、键名）、`i18n-codes`（登记表里的代码都有文案）、`i18n-unused`（没人用的键）、`i18n-glossary` 和 `i18n-wording`（术语、系统用词、中英文间距、标点）、`ui-strings`（源码字符串里的汉字）、`generated-fresh`（改了文案要运行 `pnpm generate`）。
- 现在没有、随 M2 的界面包才有的：JSX 里写死文字的 Biome 规则（`biome.json` 已配好，对应目录出现时生效）、组件属性的 `Localized` 类型、伪语言下扫页面。别把这些当成已经拦住了。
- 命令行的输出口在 `packages/cli/src/output/`，只收 `Localized`；`ui-strings` 检查保证只有那个目录能写标准输出和标准错误。
- 可选参数（登记表里 `exitCode?`）写成 `{exitCode, select, none {} other {…{exitCode}…}}`；术语不成对的例外和字数上限写在 `locales/notes/`（`glossarySkip` 加必填的 `glossarySkipReason`、`max`）。
- 开发者诊断（抛出的异常消息）用英文，不要在源码字符串里写汉字；确实需要时同一行或上一行写 `// i18n-allow: 理由`。
- `pnpm i18n:build` 之后 `git diff` 里 `generated/messages.d.ts` 只有预期的键；`pnpm test --filter @runyard/i18n` 里的 `build/build.test.ts` 通过（它核对生成物是最新的）。
- `pnpm verify` 通过。
- 代码里没有写死的中文或英文句子，没有用加号或模板字符串拼两句文案。

## 完成标准

- 同一个键在中文和英文里都有，参数名一致，术语用的是术语表里的词。
- 带参数的键有备注。
- `--json` 的输出没有因为语言变化：`message`、`hint` 永远是英文，智能体看 `code`。
- 手册有错或缺步骤，在同一次改动里改掉。
