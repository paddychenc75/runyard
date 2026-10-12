import { type Check, listWorkspacePackages } from "./workspace.ts";

// test-phases：每个有测试的包都按同一种方式分两个阶段跑（docs/guides/testing.md“两个阶段”）。
// 单元阶段 `test` 并行跑普通测试；进程阶段 `test:process` 由根命令一次一个包地跑带 `.platform-dependent.test.ts` 后缀的测试。
// 新包照抄下面两行，进程测试（比如 supervisor 的集成测试）才会被自动接进来，不会被漏掉或跑在单元阶段里。
export const EXPECTED_SCRIPTS = {
  test: "vitest run --project unit",
  "test:process": "vitest run --project process --passWithNoTests",
} as const;

export const testPhases: Check = {
  name: "test-phases",
  run(root) {
    const errors: string[] = [];
    for (const { dir, manifest } of listWorkspacePackages(root)) {
      if (
        manifest.scripts?.test === undefined &&
        manifest.scripts?.["test:process"] === undefined
      ) {
        continue;
      }
      for (const [name, command] of Object.entries(EXPECTED_SCRIPTS)) {
        if (manifest.scripts?.[name] !== command) {
          errors.push(
            `${dir}/package.json 的脚本 ${name} 应该是 "${command}"。两个测试阶段的写法在全仓库一致，改成这一行，见 docs/guides/testing.md。`,
          );
        }
      }
    }
    return errors;
  },
};
