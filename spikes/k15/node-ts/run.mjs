// Node 24 直接运行另一个工作区包的 .ts 源码（"exports": "./src/index.ts"）：
// 哪些写法能跑、哪些报错，以及对包的写法的约束。全部在临时目录里，用 pnpm 的 workspace 链接，和仓库的真实结构一致。
import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { run, tempDir, write, saveResult, tail } from "../lib.mjs";

const results = { node: process.version, when: new Date().toISOString() };
const dir = tempDir("nodets");
const setup = () => {
  write(dir, "pnpm-workspace.yaml", `packages:\n  - "packages/*"\nstoreDir: ${dir}/.store\ncacheDir: ${dir}/.cache\nminimumReleaseAge: 20160\n`);
  write(dir, "package.json", JSON.stringify({ name: "root", private: true, version: "1.0.0", type: "module" }));
  // 包 a：被导入；包 b：导入 a
  write(dir, "packages/a/package.json", JSON.stringify({ name: "@k/a", version: "1.0.0", type: "module", exports: { ".": "./src/index.ts", "./enum": "./src/enum.ts", "./ns": "./src/ns.ts", "./param": "./src/param.ts", "./noext": "./src/noext.ts", "./types": "./src/types.ts" } }));
  write(dir, "packages/a/src/index.ts", `export interface Msg { id: number }\nexport type Id = number;\nexport function hello(m: Msg): string { return "hello " + m.id; }\nexport const VERSION = 1 as const;\n`);
  write(dir, "packages/a/src/types.ts", `export interface OnlyType { x: number }\nexport type Alias = string;\n`);
  write(dir, "packages/a/src/enum.ts", `export enum Color { Red, Green }\n`);
  write(dir, "packages/a/src/ns.ts", `export namespace NS { export const x = 1; }\n`);
  write(dir, "packages/a/src/param.ts", `export class P { constructor(public x: number) {} }\n`);
  write(dir, "packages/a/src/helper.ts", `export const h = "helper";\n`);
  write(dir, "packages/a/src/noext.ts", `import { h } from "./helper";\nexport const v = h;\n`);
  write(dir, "packages/b/package.json", JSON.stringify({ name: "@k/b", version: "1.0.0", type: "module", dependencies: { "@k/a": "workspace:*" } }));
};
setup();
const inst = run("pnpm", ["install", "--no-frozen-lockfile"], { cwd: dir, env: { CI: "" } });
results.install = { code: inst.code };
const b = (name, src, extra = []) => {
  write(dir, `packages/b/${name}`, src);
  const r = run("node", [...extra, `packages/b/${name}`], { cwd: dir });
  return { code: r.code, out: tail(r.out, 6).slice(0, 700) };
};
const out = {};
out["1 跨包导入（pnpm workspace 链接），导入函数与 const"] = b("t1.ts", `import { hello, VERSION } from "@k/a";\nconsole.log(hello({ id: VERSION }));\n`);
out["2 import type 导入接口与类型别名"] = b("t2.ts", `import type { Msg, Id } from "@k/a";\nimport { hello } from "@k/a";\nconst m: Msg = { id: 2 as Id };\nconsole.log(hello(m));\n`);
out["3 不加 type 的普通导入类型（Msg 只是类型）"] = b("t3.ts", `import { hello, Msg } from "@k/a";\nconst m: Msg = { id: 3 };\nconsole.log(hello(m));\n`);
out["3b 内联 type 修饰符 import { type Msg }"] = b("t3b.ts", `import { hello, type Msg } from "@k/a";\nconst m: Msg = { id: 3 };\nconsole.log(hello(m));\n`);
out["3c 整个模块只有类型，写 import type 且模块路径是 .ts"] = b("t3c.ts", `import type { OnlyType } from "@k/a/types";\nconst x: OnlyType = { x: 1 };\nconsole.log(x.x);\n`);
out["4 导入 enum"] = b("t4.ts", `import { Color } from "@k/a/enum";\nconsole.log(Color.Green);\n`);
out["4b 导入 enum，加 --experimental-transform-types"] = b("t4b.ts", `import { Color } from "@k/a/enum";\nconsole.log(Color.Green);\n`, ["--experimental-transform-types"]);
out["5 导入 namespace（有运行时代码）"] = b("t5.ts", `import { NS } from "@k/a/ns";\nconsole.log(NS.x);\n`);
out["6 参数属性 constructor(public x)"] = b("t6.ts", `import { P } from "@k/a/param";\nconsole.log(new P(6).x);\n`);
out["7 包内相对导入不写 .ts 扩展名"] = b("t7.ts", `import { v } from "@k/a/noext";\nconsole.log(v);\n`);
out["8 b 自己的文件里用 as / satisfies / 泛型 / 可选参数（可擦除语法）"] = b("t8.ts", `const f = <T,>(x: T, y?: number): T => x;\nconst o = { a: 1 } satisfies Record<string, number>;\nconsole.log(f<string>("ok") as string, o.a);\n`);
out["9 相对 .ts 扩展名导入"] = (() => { write(dir, "packages/b/lib.ts", `export const z = 9;\n`); return b("t9.ts", `import { z } from "./lib.ts";\nconsole.log(z);\n`); })();
out["10 相对导入不写扩展名"] = b("t10.ts", `import { z } from "./lib";\nconsole.log(z);\n`);
out["11 tsconfig paths 别名（Node 不认）"] = (() => { write(dir, "packages/b/tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@alias/*": ["./*"] } } })); return b("t11.ts", `import { z } from "@alias/lib.ts";\nconsole.log(z);\n`); })();
results.cases = out;

// 12 包被真正装进 node_modules（复制而不是链接，等价于从注册表安装）：Node 拒绝剥离 node_modules 下的 .ts
mkdirSync(join(dir, "app/node_modules/@k"), { recursive: true });
cpSync(join(dir, "packages/a"), join(dir, "app/node_modules/@k/a"), { recursive: true });
write(dir, "app/package.json", JSON.stringify({ name: "app", type: "module" }));
write(dir, "app/t12.ts", `import { hello } from "@k/a";\nconsole.log(hello({ id: 12 }));\n`);
const r12 = run("node", ["app/t12.ts"], { cwd: dir });
results.cases["12 同一个包以 node_modules 下的真实目录出现（不是链接）"] = { code: r12.code, out: tail(r12.out, 4).slice(0, 500) };

// 13 .ts 所在包没有 "type": "module"
write(dir, "nt/package.json", JSON.stringify({ name: "nt" }));
write(dir, "nt/t13.ts", `import { z } from "./lib.ts";\nconsole.log(z);\n`);
write(dir, "nt/lib.ts", `export const z = 13;\n`);
const r13 = run("node", ["nt/t13.ts"], { cwd: dir });
results.cases["13 包没有 type: module，.ts 里写 ESM 导入"] = { code: r13.code, out: tail(r13.out, 4).slice(0, 500) };

// 14 语法检查：node --check 对 .ts；module.stripTypeScriptTypes
write(dir, "chk/ok.ts", `const x: number = 1;\nconsole.log(x);\n`);
write(dir, "chk/bad.ts", `const x: number = ;\n`);
write(dir, "chk/enum.ts", `enum E { A }\nconsole.log(E.A);\n`);
const c1 = run("node", ["--check", "chk/ok.ts"], { cwd: dir });
const c2 = run("node", ["--check", "chk/bad.ts"], { cwd: dir });
const c3 = run("node", ["--check", "chk/enum.ts"], { cwd: dir });
const api = run("node", ["-e", `const m=require("node:module");console.log(typeof m.stripTypeScriptTypes);try{console.log(m.stripTypeScriptTypes("const x: number = 1;"));}catch(e){console.log("ERR",e.code)};try{m.stripTypeScriptTypes("enum E{A}")}catch(e){console.log("enum ->",e.code)};try{m.stripTypeScriptTypes("const x: number = ;")}catch(e){console.log("bad ->",e.code)}; console.log("features.typescript =", process.features.typescript)`], { cwd: dir });
results.syntaxCheck = {
  "node --check ok.ts": { code: c1.code, out: tail(c1.out, 3) },
  "node --check bad.ts（语法错误）": { code: c2.code, out: tail(c2.out, 4).slice(0, 400) },
  "node --check enum.ts（不可擦除语法）": { code: c3.code, out: tail(c3.out, 3).slice(0, 400) },
  "module.stripTypeScriptTypes": api.out.trim().split("\n"),
};
saveResult(`node-ts-${process.platform}`, results);
console.log(JSON.stringify(results, null, 2));
