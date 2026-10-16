import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach } from "vitest";
import { isExpired, loadQuarantine, quarantineId, today } from "./quarantine.ts";

// 名单里没到期的测试在这里被跳过。到期的不跳过，让它重新参与失败。
const day = today();
const active = new Map(
  loadQuarantine()
    .filter((entry) => !isExpired(entry, day))
    .map((entry) => [entry.id, entry]),
);

// 同 quarantine.ts：不用 new URL，jsdom 环境里它不是 Node 的 URL（#163）
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

beforeEach((context) => {
  if (active.size === 0) return;
  const titles: string[] = [context.task.name];
  for (let suite = context.task.suite; suite && suite !== context.task.file; suite = suite.suite) {
    titles.unshift(suite.name);
  }
  const id = quarantineId(relative(repoRoot, context.task.file.filepath), titles);
  if (active.has(id)) context.skip(`在隔离名单里：${active.get(id)?.reason}`);
});
