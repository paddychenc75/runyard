# @runyard/i18n

## 用途

所有“给人看的文字”的唯一出处：文案、消息格式化、数字和时长格式、命令行语言解析（技术设计 §6.8）。命令行（以后还有桌面应用）通过它把“代码加参数”变成句子；其他包不产生句子。
现状：M1 精简版。有 `createTranslator`、`createTestTranslator`、`createFormat`、`resolveCliLocale`、`Localized` 和键类型生成，以及六项仓库检查（见下）；命令行用的文案组已写好中英文：`cli`（命令说明、`--help`、用法错误、`config` 的输出）、`errors`（登记表里每个错误码的 title、body、hint、hintCli）、`notice`、`runState`、`platform`、`format`；React 绑定、伪语言随后续 issue 加入。

## 对外暴露什么

只从 `src/index.ts` 导出（`exports` 只有 `.`）。其他包只从 `@runyard/i18n` 导入，不伸进 `src/`。
- `createTranslator({ locale, platform, catalogs })` 得到 `{ locale, t }`；`t(key, values)` 返回 `Localized`。
- `createTestTranslator()`：测试用，返回“键加参数”（`⟦键|参数=值⟧`），测试断言键，不断言句子。
- `cliCatalogs`：命令行打包的文案组（两种语言），交给 `createTranslator({ catalogs })`；新增文案组时加进这个列表（`src/cli-catalogs.ts`）。
- `createFormat(translator)`：数字、文件大小、技术性时长、说给人听的时长、相对时间。
- `resolveCliLocale({ flag, env, saved })`：`--lang` > `RUNYARD_LANG` > `cli.json` 的 `lang` > 英文；不认识的值给 `unsupported`，调用方要在标准错误输出一行提示。读环境变量和文件由 `cli` 做。
- `Localized`：带标记的字符串，输出口只收它；包外拿不到“把任意字符串标成已翻译”的办法。

## 本包特有的规则

- 可以导入：只有 `@runyard/protocol`（依赖规则的唯一出处是 `tooling/checks/layers.json`）。能导入本包的：`runyard`（命令行）和以后的界面；`protocol`、`platform`、`core`、`supervisor`、`client` 不许。
- 第三方依赖只有 `intl-messageformat`（运行时，只在 `src/message-format.ts` 里导入，换库只动这个文件）和 `@formatjs/icu-messageformat-parser`（只在 `build/` 里导入，不进运行时）。
- `src/` 不许用 Node、浏览器、Electron 的接口，只用语言自带的 `Intl`；读文件的代码只许在 `build/`。
- 文案是一层 JSON，键是完整的点分名字，值是 ICU 文案；中文（`locales/zh-CN/`）是源语言，英文在同一个 PR 里补齐，运行时缺键回退英文。
- 错误码、提示码、运行状态的键（`errors.<码>.title|body|hint|hintCli`、`notice.<码>`、`runState.<值>`）和参数类型由 `protocol` 的登记表在类型层推出（`src/messages.ts`），不在 JSON 生成物里重复；其余键的类型由 `pnpm i18n:build` 生成。
- 协议登记表新增错误码、提示码、运行状态值而没写文案，`pnpm check` 的 `i18n-codes` 会失败；它的实现是 `build/code-texts-check.ts`，`build/code-texts-check.test.ts` 对真实文案跑同一份函数。`src/__snapshots__/code-texts.*.txt` 是用真实参数渲染的句子，改了文案要读一遍再更新。
- 可选参数的约定（登记表里 `exitCode?` 这类）：ICU 缺值会抛错，所以文案写成 `{exitCode, select, none {} other {，退出码 {exitCode}}}`；select 有 `none` 分支而参数没传时，`message-format.ts` 自动传 `"none"`。`i18n-codes` 拦下没按约定写的可选参数；必填参数漏传照样抛错。
- 术语表例外和字数上限写在 `locales/notes/`：`"glossarySkip": ["项目"]` 加必填的 `"glossarySkipReason"`；`"max": 12` 限制写死文字的字符数（参数不计）。
- `platform.<名>` 文案自动变成参数 `term_<名>`，`platform` 本身也自动可用，调用的人不传。
- 不拼句子，不在代码里判断单复数（复数写在文案里）；数字、大小、时长只走 `format.ts`。

## 仓库检查（`pnpm check`，实现在 `tooling/checks/`）

| 检查 | 拦什么 |
| --- | --- |
| `i18n-keys` | 两种语言键不一致、非法 ICU、参数名或类型不一致、复数缺类别、缺备注、超字数、键名不合规则、代码引用了不存在的键 |
| `i18n-codes` | 登记表的错误码、提示码、运行状态缺文案或多出文案，参数和登记表不符 |
| `i18n-unused` | 没被 `t("键")` 引用、也不是登记表推出的键（`platform.*` 由别的文案的 `{term_*}` 引用） |
| `i18n-glossary`、`i18n-wording` | 术语表禁用词和不成对；系统用词、中英文间距、英文全角标点、中文半角句号 |
| `ui-strings` | 产品源码字符串里的汉字；命令行输出函数所在目录之外的 `process.stdout.write` |
| `generated-fresh` | `generated/messages.d.ts` 和 `docs/reference/strings.md` 过期 |

还没有：功能模块只许用自己的文案组（`i18n-unused` 的后半条）、`site-i18n`、模板 `template.json` 的术语检查、伪语言扫页面、`Localized` 属性类型。这些随 M2 加入。命令行的输出函数已有（`packages/cli/src/output/`）。

## 子目录地图

- `src/`：运行时代码；每个文件旁有同名 `.test.ts`；`types.test.ts` 是类型测试（写错键、漏传参数必须是类型错误）
- `build/`：`pnpm i18n:build` 的生成脚本和检查共用的实现（读 JSON，要 Node），用 `tsconfig.build.json`；`tooling/checks/` 直接导入这里的 `load-catalogs.ts`、`icu-structure.ts`、`code-texts-check.ts`
- `locales/zh-CN/`、`locales/en/`：文案；`locales/notes/`：给翻译者的参数备注
- `generated/messages.d.ts`：生成物，不要手改；`build/build.test.ts` 核对它是最新的

## 测试

在仓库根目录运行（需要 Node 24）：

```sh
pnpm test --filter @runyard/i18n
pnpm i18n:build   # 改了中文文案之后
```

加文案的步骤见 `docs/guides/add-ui-string.md`。
