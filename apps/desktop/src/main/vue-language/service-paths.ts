import { join } from "node:path";

export const VUE_LANGUAGE_SERVICE_DIR = "vue-language-service";

/** 语言服务目录里各个入口的相对路径；进程管理（#412）和冒烟脚本都从这里取，不各自拼 */
export const VUE_LANGUAGE_SERVICE_PATHS = {
  guard: "network-guard.cjs",
  server: join("server", "vue-language-server.cjs"),
  types: "types",
  pluginProbe: ".",
  plugin: join("node_modules", "@vue", "typescript-plugin"),
  tsdk: join("typescript", "lib"),
  tsserver: join("typescript", "lib", "tsserver.js"),
  manifest: "manifest.json",
} as const;
