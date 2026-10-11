import { execFile } from "node:child_process";
import { promisify } from "node:util";

// pnpm deps:lookup <包名> —— 列出最近 10 个稳定版本、发布日期、距今天数，
// 并对每个版本查 A（OSV）和 B（GitHub 公告库）。C（项目自己的公告页）要手动看，
// 脚本只打印命令。用法和规则见技术设计 §8.6.4 第 2 步。

const run = promisify(execFile);
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Candidate {
  version: string;
  released: string;
  ageDays: number;
}

// 从注册表的 time 字段挑出稳定版本（不含 -beta、-rc 等），按发布时间从新到旧，取前 limit 个
export function pickCandidates(time: Record<string, string>, now: Date, limit = 10): Candidate[] {
  return Object.entries(time)
    .filter(([version]) => /^\d+\.\d+\.\d+$/.test(version))
    .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
    .slice(0, limit)
    .map(([version, released]) => ({
      version,
      released: released.slice(0, 10),
      ageDays: Math.floor((now.getTime() - Date.parse(released)) / DAY_MS),
    }));
}

async function queryOsv(pkg: string, version: string): Promise<string> {
  const response = await fetch("https://api.osv.dev/v1/query", {
    method: "POST",
    body: JSON.stringify({ package: { name: pkg, ecosystem: "npm" }, version }),
  });
  if (!response.ok) return `查询失败(${response.status})`;
  const body = (await response.json()) as { vulns?: { id: string }[] };
  return body.vulns?.map((v) => v.id).join(",") || "无";
}

async function queryGhsa(pkg: string, version: string): Promise<string> {
  try {
    const { stdout } = await run("gh", [
      "api",
      `advisories?ecosystem=npm&affects=${pkg}@${version}`,
      "--jq",
      '[.[].ghsa_id] | join(",")',
    ]);
    return stdout.trim() || "无";
  } catch {
    return "未查(gh 不可用或未登录)";
  }
}

async function main(): Promise<void> {
  const pkg = process.argv[2];
  if (pkg === undefined) {
    console.error("用法：pnpm deps:lookup <包名>");
    process.exit(2);
  }
  const response = await fetch(`https://registry.npmjs.org/${pkg.replace("/", "%2F")}`);
  if (!response.ok) {
    console.error(
      `注册表查询失败：${response.status}。检查包名，或按技术设计 §8.6.1 规则 1 手动查。`,
    );
    process.exit(1);
  }
  const meta = (await response.json()) as {
    time: Record<string, string>;
    repository?: { url?: string };
  };
  console.log(`${pkg}：最近 10 个稳定版本（挑选时要求满 15 天，见 §8.6.1 规则 2）`);
  console.log("版本\t发布日期\t天数\tA(OSV)\tB(GitHub)");
  for (const c of pickCandidates(meta.time, new Date())) {
    const [osv, ghsa] = await Promise.all([queryOsv(pkg, c.version), queryGhsa(pkg, c.version)]);
    console.log(`${c.version}\t${c.released}\t${c.ageDays}\t${osv}\t${ghsa}`);
  }
  const repo = meta.repository?.url?.match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1];
  console.log(
    repo === undefined
      ? "C（项目公告页）：没找到 GitHub 仓库，手动查。"
      : `C（项目公告页）要手动看：gh api repos/${repo}/security-advisories，再读最近两个版本的发布说明。`,
  );
}

if (import.meta.main) await main();
