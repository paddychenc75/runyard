import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// 测试用：在系统临时目录里按 {相对路径: 内容} 造一个假仓库，不碰真实仓库
export function makeRepo(files: Record<string, string | object>): string {
  const root = mkdtempSync(join(tmpdir(), "runyard-check-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

export const GOOD_WORKSPACE = `packages: [packages/*, tooling]
catalog:
  zod: 4.6.5
minimumReleaseAge: 20160
savePrefix: ""
allowBuilds:
  electron: true
`;
