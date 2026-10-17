Vue 单文件组件智能提示（Volar）可行性验证的一次性代码，不合并、不在 pnpm 工作区内（issue #315）。
运行方式见 docs/architecture/evidence/vue-intellisense.md 的“做法”；脚本里的路径是验证当时那台机器的。
fsdata.json 由 gen-fs.mjs 生成（TS 标准库 + vue 类型 + 示例项目），不提交。
