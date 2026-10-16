# Hono

A small HTTP service built with Hono and `@hono/node-server`. Edit `src/index.ts` and save: Runyard restarts the service on the same port.

Notes:

- The service listens on `127.0.0.1` only (set in `src/index.ts`). Keep `hostname: "127.0.0.1"` so it is not reachable from other machines.
- The port comes from the `PORT` environment variable, which Runyard sets.
- Node runs the TypeScript file directly (Node 22.18 or newer). Use only syntax that can be erased: no `enum`, no `namespace`.
- Dependencies are pinned to exact versions with a lockfile. Run `pnpm audit` yourself before shipping.

---

一个用 Hono 和 `@hono/node-server` 写的小型 HTTP 服务。编辑 `src/index.ts` 并保存，Runyard 会在同一个端口上重启服务。

说明：

- 服务只监听 `127.0.0.1`（写在 `src/index.ts` 里）。请保留 `hostname: "127.0.0.1"`，否则其他机器也能访问。
- 端口来自环境变量 `PORT`，由 Runyard 设置。
- Node 直接运行 TypeScript 文件（需要 Node 22.18 以上），只能用可以直接擦掉的语法：不要用 `enum`、`namespace`。
- 依赖固定为精确版本并带锁文件；发布前请自己运行 `pnpm audit`。
