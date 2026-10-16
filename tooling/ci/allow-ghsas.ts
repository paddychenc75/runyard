// 把 security/allowlist.toml 里 root 范围的公告编号交给依赖变更审查（技术设计 §8.6.3：
// 放行统一走允许清单，不在工作流里再写一份）。
// 该 Action 读 pnpm 锁文件时分不出开发依赖，开发时工具的公告也会被当成正式依赖拦下，
// 所以已登记的条目要通过它的 allow-ghsas 传进去。
// 清单格式不对、有条目过期或超限时输出空串并以 1 退出，这样例外失效时审查照样变红。
//
// 用法（在仓库根目录）：node tooling/ci/allow-ghsas.ts [--allowlist <路径>] [--today <日期>]
// 输出：逗号分隔的编号（可以为空）；退出码：0 正常；1 清单有问题；2 参数错误。

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkAllowlist, parseAllowlist } from "../checks/allowlist.ts";

export function allowedGhsas(text: string, today: Date): { ids: string[]; errors: string[] } {
  const errors = checkAllowlist(text, today);
  if (errors.length > 0) return { ids: [], errors };
  const ids = parseAllowlist(text)
    .entries.filter((entry) => entry.scope === "root" && /^GHSA-/i.test(entry.id ?? ""))
    .map((entry) => entry.id as string);
  return { ids, errors };
}

function main(argv: string[]): number {
  let path = join(import.meta.dirname, "..", "..", "security", "allowlist.toml");
  let today = new Date();
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (value === undefined || (argv[i] !== "--allowlist" && argv[i] !== "--today")) {
      console.error(`参数错误：${argv[i]}`);
      return 2;
    }
    if (argv[i] === "--allowlist") path = value;
    else today = new Date(`${value}T00:00:00Z`);
  }
  const { ids, errors } = allowedGhsas(readFileSync(path, "utf8"), today);
  for (const error of errors) console.error(error);
  console.log(ids.join(","));
  return errors.length > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
