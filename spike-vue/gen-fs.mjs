// 生成虚拟文件系统：TS 标准库 + vue 类型 + 示例项目
import ts from "typescript";
import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
const files = {};
const nm = "node_modules";
// TS lib: lib.es2022.d.ts + lib.dom.d.ts 的传递闭包
const libDir = join(nm, "typescript/lib");
const queue = ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"];
const seen = new Set();
while (queue.length) {
  const f = queue.pop(); if (seen.has(f)) continue; seen.add(f);
  const t = readFileSync(join(libDir, f), "utf8");
  files[`/node_modules/typescript/lib/${f}`] = t;
  for (const m of t.matchAll(/\/\/\/\s*<reference lib="([^"]+)"/g)) queue.push(`lib.${m[1].toLowerCase()}.d.ts`);
}
// vue 及其依赖的类型
function addDir(pkg, sub = "") {
  const dir = join(nm, pkg, sub);
  for (const e of readdirSync(dir)) {
    const p = join(dir, e), st = statSync(p);
    if (st.isDirectory()) { if (e === "node_modules") continue; addDir(pkg, join(sub, e)); }
    else if (/\.d\.ts$|package\.json$|\.d\.mts$/.test(e)) files["/" + join(nm, pkg, sub, e)] = readFileSync(p, "utf8");
  }
}
addDir("@vue/language-core", "types");
for (const pkg of ["vue", "@vue/runtime-dom", "@vue/runtime-core", "@vue/reactivity", "@vue/shared", "@vue/compiler-dom", "@vue/compiler-core", "@vue/server-renderer", "@vue/compiler-sfc", "@vue/compiler-ssr", "csstype"]) {
  try { addDir(pkg); } catch (e) { console.error("skip", pkg, e.message); }
}
Object.assign(files, {
  "/proj/tsconfig.json": "{}",
  "/proj/src/env.d.ts": `declare module '*.vue' { import type { DefineComponent } from 'vue'; const c: DefineComponent<{}, {}, any>; export default c }`,
  "/proj/src/components/Child.vue": `<script setup lang="ts">
defineProps<{ title: string; count?: number; /** 是否高亮 */ highlighted?: boolean }>()
defineEmits<{ (e: 'select', id: number): void }>()
</script>

<template>
  <div>{{ title }} {{ count }}</div>
</template>
`,
  "/proj/src/App.vue": `<script setup lang="ts">
import { ref, computed } from 'vue'
import Child from './components/Child.vue'

const n = ref(1)
const doubled = computed(() => n.value * 2)
const label: string = 42
</script>

<template>
  <Child  />
  <Chi
  <Child title="a" :count="'x'" />
  <p>{{ doubled. }}</p>
</template>
`,
});
writeFileSync("src/fsdata.json", JSON.stringify(files));
console.log(Object.keys(files).length, "files", (JSON.stringify(files).length / 1e6).toFixed(2), "MB");
