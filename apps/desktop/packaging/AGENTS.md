# 桌面应用的打包（`apps/desktop/packaging/`）

## 用途

把应用打成 `.app` 时用到的配置和随包文件的生成：electron-builder 配置、开关（fuse）、图标、node-pty、随包的运行时，以及 Vue 语言服务目录（#411，决策记录 0021，证据 `docs/architecture/evidence/vue-intellisense.md`“第二次验证”）。入口是 `apps/desktop/pack.ts`，总说明见 `apps/desktop/AGENTS.md` 的“打包”。

## 对外暴露什么

不是库。`pack.ts` 调用这里的函数。Vue 语言服务目录的函数：`buildVueLanguageService(desktopDir, outDir)` 生成目录，`vueLanguageServiceProblems(root)` 核对，`VUE_LANGUAGE_SERVICE_PATHS` 是目录里各入口的相对路径（进程管理 #412 从这里取，不自己拼）。

## 本包特有的规则

- Vue 语言服务目录放进 `Contents/Resources/vue-language-service/`，不进 asar（Node 的权限模型要按真实路径授权读权限）。内容：`server/vue-language-server.cjs`（`@vue/language-server` 用 esbuild 打成一个文件并压缩，`mainFields` 为 `module,main`，`typescript` 不打进去）；`types/`（`@vue/language-core` 的类型文件，必须在打包文件的上一级）；`node_modules/@vue/typescript-plugin` 加它的运行时依赖；`typescript/lib/`（只有 `typescript.js`、`_tsserver.js`、`tsserver.js`、`lib.*.d.ts`、`zh-cn/`，加 `package.json`）；`manifest.json`（各部分版本）。
- `@vue/typescript-plugin` **原样复制，不许打包或压缩**：打成一个文件后脚本侧的悬停、跳转失效。复制时去掉 `.map`、`.md`、多余的 `.d.ts`，保留 `@vue/language-core/types/`。`@vue/language-server` 和 `@vue/typescript-plugin` 必须同版本，升级时一起升。
- electron-builder 的额外资源无论怎么写过滤都会丢掉名叫 `node_modules` 的目录，所以 `builder-config.ts` 的 `extraResources` 不含它，`afterPack`（先于签名）把 `node_modules` 补进 `.app`；目录名改不了，tsserver 从 `<语言服务目录>/node_modules/@vue/typescript-plugin` 找插件。打完后 `pack.ts` 用 `vueLanguageServiceProblems` 核对文件齐全。
- 冒烟：`node tooling/scripts/vue-language-service-smoke.ts --app <Runyard.app>`。在打好的 `.app` 上用 `ELECTRON_RUN_AS_NODE=1` 加 `--permission`（只给测试项目和语言服务目录的读权限）起两个进程，对 `tooling/scripts/vue-smoke-fixture` 的组件做属性名补全，拿到 `title`、`count` 才通过；`HOME` 指向新建的临时目录。进程管理、守卫脚本、界面接线不在这里（#412 起）。

## 子目录地图

- `bin/`：随包的启动脚本 `runyard`。
- `*.platform-dependent.test.ts`：起真文件或真进程的测试，只在 macOS 和 Ubuntu 跑。

## 测试

纯逻辑用 Vitest（`vue-language-service.test.ts`、`fuses.test.ts` 等）。`vue-language-service.platform-dependent.test.ts` 真的用 esbuild 和文件复制生成一份目录并核对结构。完整的打包和冒烟在本机或 macOS 的 CI 上手动跑：`pnpm --filter @runyard/desktop package -- --dir --out "$(mktemp -d)"`，再跑上面的冒烟。
