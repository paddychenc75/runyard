# spikes：技术验证

这里放 M0a 的技术验证（技术设计 §11.1）。每个 spike 是一个一次性的小实验，只回答 §11.1 表里的一行“行不行”，不是产品代码。

## 目录

```
spikes/<id>/
├─ package.json     自己独立的包，不属于根工作区
├─ README.md        结论：行或不行，依据是什么
└─ adr-draft.md     决策记录草稿
```

## 规则

- 不参与代码风格和结构检查（Biome、`pnpm check` 的各项、类型检查、测试）；唯一的忽略点在 `tooling/checks/docs.ts` 和 `biome.json`。
- 依赖安全规则照旧：每个 spike 用自己的 `package.json` 和锁文件，只用精确版本，发布满 14 天才许安装（`minimumReleaseAge`）。审计和依赖审查不豁免。
- 不遵守包依赖规则、文件行数上限等包内约定，根 `AGENTS.md` 的包规则不适用于这里。
- M0a 结束时，先把各 spike 的结论转写成决策记录，再把整个文件夹删掉。
