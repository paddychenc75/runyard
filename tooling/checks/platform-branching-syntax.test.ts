import { describe, expect, it } from "vitest";
import { platformBranching } from "./platform-branching.ts";
import { checkProcessAndSeparators } from "./platform-branching-syntax.ts";
import { makeRepo } from "./test-helpers.ts";

const check = (code: string, path = "packages/core/src/a.ts") =>
  checkProcessAndSeparators(path, code);

describe("直接启动进程", () => {
  it("坏样例：import、具名导入、require、动态 import、再导出 child_process 都报，带文件和行号", () => {
    const bad = [
      `import { spawn } from "node:child_process";`,
      `import cp from "child_process";`,
      `const { exec } = require("node:child_process");`,
      `const m = await import("node:child_process");`,
      `export { fork } from "child_process";`,
    ].join("\n");
    const errors = check(bad);
    expect(errors).toHaveLength(5);
    errors.forEach((error, index) => {
      expect(error).toContain(`packages/core/src/a.ts:${index + 1} `);
      expect(error).toContain("platform.exec");
    });
  });

  it("好样例：经 platform.exec 启动、只在字符串和注释里提到、只导入类型，都不报", () => {
    const good = `import type { ChildProcess } from "node:child_process";
import { getPlatform } from "@runyard/platform";
// 不要直接用 child_process
const script = "const { spawn } = require('node:child_process');";
export const run = (p: ReturnType<typeof getPlatform>) => p.exec.spawn({ argv: ["ls"], cwd, env, stdin: false });`;
    expect(check(good)).toEqual([]);
  });
});

describe("手写路径分隔符", () => {
  it("坏样例：模板字符串和 + 拼出来的路径传给 fs 或 path 函数，每处都报行号", () => {
    const bad = `import * as fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
const fsp = require("node:fs/promises");
export async function load(dir: string, name: string) {
  await readFile(\`\${dir}/\${name}.json\`, "utf8");
  fs.writeFileSync(dir + "/" + name, "x");
  fs.promises.mkdir(\`\${dir}\\\\\${name}\`);
  await fsp.stat(dir + "\\\\" + name);
  return path.join(\`\${dir}/sub\`, name);
}`;
    const errors = check(bad);
    expect(errors.map((e) => e.split(" ")[0])).toEqual([
      "packages/core/src/a.ts:6",
      "packages/core/src/a.ts:7",
      "packages/core/src/a.ts:8",
      "packages/core/src/a.ts:9",
      "packages/core/src/a.ts:10",
    ]);
    expect(errors[0]).toContain("node:path");
  });

  it("坏样例：用 + 把 path.sep 拼进字符串", () => {
    const errors = check(
      `import path, { sep } from "node:path";\nconst a = dir + path.sep + name;\nconst b = sep + name;`,
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain(":2 ");
    expect(errors[1]).toContain(":3 ");
  });

  it("好样例：路径工具拼接、URL、导入路径、glob、正则、相对路径 join 都不报", () => {
    const good = `import path from "node:path";
import { readFile } from "node:fs/promises";
import { load } from "./sub/file.ts";
export async function run(dir: string, name: string, id: string) {
  await readFile(path.join(dir, name), "utf8");
  await readFile("/etc/hosts");
  const url = \`http://127.0.0.1:\${id}/api/\${name}\`;
  const glob = \`\${dir}/**/*.ts\`;
  const re = new RegExp(\`^\${name}/\`);
  const rel = ["a", "b"].join("/");
  window.open(\`\${dir}/x\`);
  return fetch(dir + "/api");
}`;
    expect(check(good)).toEqual([]);
  });

  it("不是 node:fs 或 node:path 的同名函数不报", () => {
    expect(
      check(`import { join } from "lodash";\njoin(\`\${a}/\${b}\`);\ncache.stat(\`\${a}/\${b}\`);`),
    ).toEqual([]);
  });
});

describe("platformBranching 检查整体", () => {
  const spawnBad = `import { spawn } from "node:child_process";\nspawn("ls");\n`;
  const sepBad = `import { readFileSync } from "node:fs";\nreadFileSync(dir + "/" + name);\n`;

  it("别的包被拦住，平台层和 integration 目录放行，tooling 不查", () => {
    const root = makeRepo({
      "packages/core/src/run.ts": spawnBad,
      "packages/cli/src/load.ts": sepBad,
      "packages/platform/src/posix/x.ts": spawnBad + sepBad,
      "apps/desktop/src/main/integration/y.ts": spawnBad,
      "tooling/ci/z.ts": spawnBad + sepBad,
    });
    const errors = platformBranching.run(root);
    expect(errors).toHaveLength(2);
    expect(errors.join("\n")).toContain("packages/core/src/run.ts:1");
    expect(errors.join("\n")).toContain("packages/cli/src/load.ts:2");
  });
});
