// 把 results.json 汇总成 summary.md（贴进 job 日志和 GITHUB_STEP_SUMMARY）。
import { writeFileSync } from "node:fs";
import path from "node:path";

const short = (c) =>
  Object.entries(c)
    .map(([k, v]) => `${k.replace("sgr_color", "sgr").replace("csi_", "").replace("osc_", "osc-")}:${v}`)
    .join(" ") || "-";

export function writeReport(out, { env, ctx }) {
  const L = [];
  L.push(`# K4 结果摘要（${env.platform}，Node ${env.node}${env.cn ? "，中文路径" : ""}）`, "");
  L.push("## 离线自检（清洗规则）", "");
  for (const t of ctx.selfTest ?? []) L.push(`- ${t.ok ? "通过" : "**失败**"}：${t.name}${t.detail ? `（${t.detail}）` : ""}`);
  L.push("", "## 逐用例", "", "| 用例 | 退出 | 原始控制序列（计数） | 残留行 | U+FFFD 行 | 编码回退行 | 标记 | 延迟/间隔 ms | 乱序 |", "|---|---|---|---|---|---|---|---|---|");
  for (const r of ctx.results) {
    const mk = Object.entries(r.markers ?? {});
    const mkOk = mk.length ? `${mk.filter(([, v]) => v).length}/${mk.length}` : "-";
    const lat = r.latency ? `max延迟 ${r.latency.maxDelayMs} / 最大间隔 ${r.latency.maxInterArrivalGapMs} / 到达批次 ${r.latency.distinctArrivalInstants}` : "-";
    const ord = r.order ? r.order.inversions : "-";
    L.push(`| ${r.id} | ${r.exit?.code ?? r.exit?.signal ?? "?"}${r.exit?.pipesClosed === false ? "(管道未关)" : ""}${r.timedOut ? "(超时)" : ""}${r.driveError ? "(驱动失败)" : ""} | ${short(r.census.counts)} | ${r.health.residualLines} | ${r.health.fffdLines} | ${r.health.gbkFallbackLines} | ${mkOk} | ${lat} | ${ord} |`);
  }
  if (ctx.skipped.length) L.push("", "## 跳过", "", ...ctx.skipped.map((s) => `- ${s.what}：${s.why}`));
  const md = L.join("\n") + "\n";
  writeFileSync(path.join(out, "summary.md"), md);
  console.log("\n" + md);
}
