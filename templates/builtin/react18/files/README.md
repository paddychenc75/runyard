# React 18 + Vite

Edit `src/App.tsx` and save: Vite updates the page without restarting.

React 18 is no longer updated (the last release is 18.3.1, April 2024). Prefer the react19 template for new projects.

Notes:

- Vite's error overlay keeps its colors and they cannot be turned off. Vite does not support `--no-color`.
- Dependencies are pinned to exact versions with a lockfile. Run `pnpm audit` yourself before shipping.

---

编辑 `src/App.tsx` 并保存，Vite 会直接更新页面，不会重启。

React 18 已不再更新（最后一个版本是 2024 年 4 月的 18.3.1）。新项目请优先用 react19 模板。

说明：

- Vite 的报错框颜色去不掉，Vite 也不支持 `--no-color`。
- 依赖固定为精确版本并带锁文件；发布前请自己运行 `pnpm audit`。
