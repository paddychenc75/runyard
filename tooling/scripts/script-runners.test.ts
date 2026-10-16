import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateRunner } from "../../packages/protocol/src/index.ts";

// node-ts 运行器的检查命令对着真正的 Node 跑（Node 一定在：测试本身就跑在它上面）。
// python-file 和 go 需要本机另有解释器和编译器，它们的真实行为由 `pnpm template:smoke` 验证。

const repoRoot = join(import.meta.dirname, "..", "..");
const runner = validateRunner(
  JSON.parse(
    readFileSync(join(repoRoot, "templates", "runners", "node-ts", "runner.json"), "utf8"),
  ),
).value;
if (runner?.check === undefined || runner.run === undefined)
  throw new Error("node-ts 运行器不合格");

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); // delete-allow: 测试自己建的临时目录
});

function runWithNode(command: readonly string[], dir: string, entry: string) {
  const [, ...args] = command.map((word) => (word === "{entry}" ? entry : word));
  return spawnSync(process.execPath, args, { cwd: dir, encoding: "utf8" });
}

function projectWith(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "runyard-node-ts-"));
  temps.push(dir);
  writeFileSync(join(dir, "main.ts"), source);
  return dir;
}

describe("node-ts 运行器的检查（真实的 Node）", () => {
  const check = (dir: string) => runWithNode(runner.check?.command ?? [], dir, "main.ts");

  it("[RUN-SCRIPTS-18] 合法的带类型注解的 .ts 通过检查；含 enum 的写法不通过；检查命令里没有 node --check", () => {
    const annotated = projectWith(
      "const n: number = 1;\nfunction f(a: string): string { return a; }\n",
    );
    expect(check(annotated).status).toBe(0);
    const withEnum = projectWith("enum Color { Red }\nconsole.log(Color.Red);\n");
    const rejected = check(withEnum);
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX");
    expect(runner.check?.command).not.toContain("--check");
    expect(runner.check?.command.join(" ")).toContain("stripTypeScriptTypes");
  });

  it("[TEMPLATES-RUNNERS-25] 语法错误的 .ts 不通过检查（真实的 Node 报 ERR_INVALID_TYPESCRIPT_SYNTAX）", () => {
    const broken = check(projectWith("const = ;\n"));
    expect(broken.status).not.toBe(0);
    expect(broken.stderr).toContain("ERR_INVALID_TYPESCRIPT_SYNTAX");
  });

  it("[TEMPLATES-RUNNERS-23] 模板自带的 main.ts 通过检查，并被 node 直接运行（没有加载器、没有 node_modules）", () => {
    const source = readFileSync(
      join(repoRoot, "templates", "builtin", "node-ts", "files", "main.ts"),
      "utf8",
    );
    const dir = projectWith(source);
    expect(check(dir).status).toBe(0);
    const ran = runWithNode(runner.run?.command ?? [], dir, "main.ts");
    expect(ran.status).toBe(0);
    expect(ran.stdout).toContain("Hello, Runyard!");
  });
});
