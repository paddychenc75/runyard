// zod 4.6.5：生成 JSON Schema 的接口名（技术设计 §8.1 zod 一行里评审人凭记忆说是 z.toJSONSchema()）。
import { createRequire } from "node:module";
import { join } from "node:path";
import { run, tempDir, write, saveResult } from "../lib.mjs";

const dir = tempDir("zod");
write(dir, "package.json", JSON.stringify({ name: "z", private: true, version: "1.0.0", dependencies: { zod: "4.6.5" } }));
write(dir, "pnpm-workspace.yaml", `storeDir: ${dir}/.store\ncacheDir: ${dir}/.cache\nminimumReleaseAge: 20160\n`);
const inst = run("pnpm", ["install"], { cwd: dir, env: { CI: "" } });
const require = createRequire(join(dir, "package.json"));
const { z } = require("zod");
const schema = z.object({ id: z.string(), kind: z.enum(["a", "b"]), n: z.number().int().optional() });
const out = { install: inst.code, version: require("zod/package.json").version, hasToJSONSchema: typeof z.toJSONSchema, hasOldPackage: (() => { try { require.resolve("zod-to-json-schema"); return true; } catch { return false; } })() };
out.sample = z.toJSONSchema(schema);
saveResult("zod-jsonschema", out);
console.log(JSON.stringify(out, null, 2));
