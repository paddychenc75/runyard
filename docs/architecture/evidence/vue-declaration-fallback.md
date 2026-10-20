# 没有 Vue 依赖时的官方声明兜底

日期：2026-10-19。对应 ADR 0022、issue #415、DESKTOP-EDITOR-87；不改变 ADR 0021 的双进程只读边界。

## 起因与选择

真实进程反例：项目只有本地 Child.vue 的 defineProps，没有 node_modules/vue 时，官方语言服务只返回 v-bind、key、ref 等全局项，没有 title/count/tone。language-core 生成代码仍引用 vue 的 PropType、DefineComponent、ComponentPublicInstance；[官方配置说明](https://github.com/vuejs/language-tools/wiki/Vue-Compiler-Options)中的 lib 只指定包名，typesRoot 只指定语言工具辅助类型，不能替代 Vue 运行时声明。

已有 tooling/vue@3.5.43 是构建输入。只复制它的声明闭包、package.json 与许可证；不新增依赖、不复制 Vue JS、不写用户 node_modules/tsconfig。第一方解析插件先委托原解析器，只有 vue、vue/jsx-runtime、vue/jsx-dev-runtime 未解析成功时才返回固定随包声明。原解析成功返回原对象；原解析抛错保持抛错，未知包和原型名字不兜底。

## 已测结果

| 项目 | 结果 |
| --- | --- |
| 无依赖的本地组件 | 官方服务恢复 title/count/tone，不是属性词表 |
| 真实依赖类型 | ref(1) 的悬停包含 Ref<number，属性悬停包含 title: string |
| 不同项目声明优先 | 使用带可辨 ProjectOwnedRef 类型的测试依赖，返回项目类型而不是随包类型 |
| 安装后切换 | 从随包 Ref 切到测试项目的 ActualInstalledRef；由现有依赖监听触发，无须重开文件 |
| 项目配置与路径 | @/* 别名解析到 src；组件与属性定义落到项目文件；项目外/依赖目录目标不提供跳转 |
| 错误 | 脚本类型、属性类型、缺必填属性和未声明变量四处各有诊断；缺模块码沿用 TS 屏蔽清单 |
| 权限 | 原 16 项文件/网络/子进程/线程反例继续通过，两个允许读取目录不变 |
| 打包 | 真实 Resources 下 fallback-types/node_modules 存在，签名与 e2e fuses 校验通过 |

## 资产数字与许可证

在 macOS、Electron 44.5.1、TypeScript 6.0.3、官方语言工具 3.3.12 上实测：

- 声明和包元数据：127 文件、2,214,146 字节（约 2.11 MiB）。
- 加上 23 份许可证和生成的清单：151 文件、2,241,531 字节。
- 23 个依赖包：20 个 MIT，各 1 个 ISC（picocolors）、BSD-2-Clause（entities）、BSD-3-Clause（source-map-js）。每个包的许可证都保留在自己的目录。
- fallback-types 内没有 .js/.mjs/.cjs 文件；打包后的每个文件与构建源逐字节一致。
- 版本清单 SHA-256：`c212e576d488a481894d060da503df3aeca3a06902312fd657f726148e8b5020`。
- asar 不再重复包含开发构建的 dist/vue-language-service；成品只保留 Resources 的一份服务目录。

Vue 3.5.43 的年龄及 A/B/C 安全审查沿用 [依赖记录](../dependencies.md) 2026-10-18 的结果（当时已发布 31 天）。没有修改 allowlist、minimumReleaseAgeExclude、包版本或锁文件。

## 可复核的测试

- `apps/desktop/src/main/integration/vue-inspection.platform-dependent.test.ts`：本地属性、真实类型、别名、定义、四类错误、项目声明优先。
- `apps/desktop/src/main/integration/vue-channel.platform-dependent.test.ts`：安装后自动切换、文档身份与关闭顺序。
- `apps/desktop/src/main/integration/vue-process.platform-dependent.test.ts`：真实受限进程与权限反例。
- `apps/desktop/src/main/integration/vue-types-fallback.test.ts`：原解析优先、固定白名单、原解析错误不伪装成功。
- `apps/desktop/packaging/vue-language-service.platform-dependent.test.ts`：声明目录、许可证与无 JS。
- `apps/desktop/e2e/vue-inspection.e2e.ts`：打包应用里浅深悬停、四处波浪线、真实 F12 打开组件及定位属性；与 TypeScript 控件对照。

截图在 CI e2e 产物，不进仓库。完整性能目标和中英 × 两宽最终设计对照仍由 #416 完成，本记录不代替该验收。
