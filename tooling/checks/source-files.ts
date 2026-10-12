import { listFiles } from "./docs.ts";

// 国际化检查共用：哪些文件是“会进产品的源码”。
// 范围是 packages/*/src 和 apps/*/src（技术设计 §6.8 第 4 层）。不算：
// - 测试文件（*.test.ts、*.spec.ts）：仓库规定测试标题和断言可以是中文；
// - 平台契约和测试辅助（*.contract.ts、contract/、test-support/、fixtures/）：只在测试里运行；
// - packages/testing/：整个包是测试替身，只许被测试导入（testing-imports 检查保证）；
// - 声明文件和快照。
// tooling/、docs/、locales/ 不在 src 下，天然不在范围里。

const SOURCE = /^(?:packages|apps)\/[^/]+\/src\/.+\.(?:ts|tsx|mts)$/;
const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|mts)$/;
const TEST_SUPPORT = /\.contract\.ts$|\/(?:test-support|fixtures|contract|__snapshots__)\//;

export function isProductSource(path: string): boolean {
  return (
    SOURCE.test(path) &&
    !TEST_FILE.test(path) &&
    !TEST_SUPPORT.test(path) &&
    !path.endsWith(".d.ts") &&
    !path.startsWith("packages/testing/")
  );
}

export function listProductSources(root: string): string[] {
  return listFiles(root).filter(isProductSource);
}
