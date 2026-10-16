# 证据：`light-dark()` 在 Electron 44 里的可用性

出处：技术设计 §6.7 和附录 B（“`light-dark()` 需要 Chromium 123 以上，Electron 44 内置 152，可用性在 M2 开头实测”）；issue #162 的完成标准。

## 做了什么

2026-10-16 在负责人的 Mac 上，用 Electron 44.5.1（Chromium 152.0.7977.130）开一个不显示的窗口，加载 `packages/tokens/generated/tokens.css`，页面里一个方块用 `background: var(--color-bg-window)` 和 `box-shadow: var(--shadow-1)`。用 `getComputedStyle` 读出算出来的值，依次切换主进程的 `nativeTheme.themeSource` 和 `<html>` 的 `data-theme`。脚本放在临时目录，用完删除，用的是现成的 Electron 可执行文件，没有安装新东西。

## 结果

| 情况 | 背景色 | 阴影开头 | `color-scheme` |
| --- | --- | --- | --- |
| `themeSource = light`，不写 `data-theme` | `rgb(255, 255, 255)` | `rgba(0, 0, 0, 0.08) 0px 0px 0px 0.5px` | `light dark` |
| `themeSource = dark`，不写 `data-theme` | `rgb(28, 28, 30)` | `rgba(0, 0, 0, 0.45) 0px 10px 28px` | `light dark` |
| `themeSource = light`，`data-theme = dark` | `rgb(28, 28, 30)` | 同上（深色阴影） | `dark` |
| `themeSource = light`，`data-theme = light` | `rgb(255, 255, 255)` | 同上（浅色阴影） | `light` |

`CSS.supports("color", "light-dark(red, blue)")` 在四种情况下都是 `true`。

## 结论

- 颜色用 `light-dark()` 可用：跟随系统（`themeSource`）和用 `data-theme` 强制都生效，切换不需要重新渲染。
- 阴影不能用 `light-dark()`（它只接受颜色），所以 `tokens.css` 对阴影用主题选择器分别写；上表第 3、4 行证明这条路径在 Electron 里也生效。
- 没有测到的：`prefers-reduced-transparency`（只检查了生成的 CSS 里有这一段，没有在窗口里开系统设置验证）；Windows（第一版不做）。
- 这是一次手工实测，不进 CI：CI 的单元测试不起 Electron。仓库里守着它的是 `packages/tokens/build/build.test.ts`（生成的 CSS 里颜色一律是 `light-dark()`、阴影一律走选择器）。
