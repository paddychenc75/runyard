// 把结果文件汇总成表。可以单独运行：node src/summarize.mjs results/*.json
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const q = (xs, p) => {
  if (xs.length === 0) return "—";
  const s = [...xs].sort((a, b) => a - b);
  return String(s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]);
};
const stat = (xs) => (xs.length ? `${q(xs, 0.5)} / ${q(xs, 0.95)} / ${q(xs, 1)}` : "—");

export function summarize({ meta, notes, records }) {
  const groups = new Map();
  for (const r of records) {
    const key = `${r.runner} | ${r.method} | ${r.scenario}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const lines = [];
  lines.push(`### ${meta.label || meta.platform}：${meta.os}；${meta.image}；Node ${meta.node}；${meta.cpus}`);
  lines.push(`工具：${Object.entries(meta.tools).map(([k, v]) => `${k} ${v}`).join("；")}；框架：${Object.entries(meta.versions ?? {}).map(([k, v]) => `${k}@${v}`).join(" ")}`);
  lines.push("");
  lines.push("| 运行器 | 办法 | 场景 | 次数 | 出错 | 残留（等 5 秒仍在） | 树外残留 | 树外短命进程（次数 / 最久 ms） | 停止返回时还活着 | 升级为强杀 | 端口可重绑 ms（中位/p95/最大） | 超过 3 秒 | 根进程退出 ms（中位/最大） | 树死光 ms（中位/最大） | 管道被占着 | 最多进程数 | 退出码 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const [key, rs] of groups) {
    const port = rs.map((r) => r.portMs).filter((v) => typeof v === "number" && v >= 0);
    const rootExit = rs.map((r) => r.stop?.rootExitMs).filter((v) => typeof v === "number").map(Math.round);
    // POSIX 上“树死光”取进程组变空的时刻（10 毫秒一查）；Windows 上靠进程表快照，分辨率是几百毫秒，偏大
    const groupEmpty = (r) => r.stop?.steps?.find((s) => s.what === "进程组已空")?.at;
    const treeDead = rs.map((r) => groupEmpty(r) ?? r.leftover?.treeDeadMs).filter((v) => typeof v === "number").map(Math.round);
    const codes = new Map();
    for (const r of rs) {
      const e = r.stop?.exit ?? {};
      const k = e.timeout ? "超时" : (e.signal ?? String(e.code));
      codes.set(k, (codes.get(k) ?? 0) + 1);
    }
    lines.push(
      `| ${key.replaceAll(" | ", " | ")} | ${rs.length} | ${rs.filter((r) => r.error).length} | ${rs.filter((r) => r.leftover?.survivors?.length).length} | ${rs.filter((r) => r.leftover?.untracked?.length).length} | ${rs.filter((r) => r.leftover?.transient?.length).length} / ${Math.max(0, ...rs.map((r) => r.leftover?.transientGoneMs ?? 0))} | ${rs.filter((r) => r.leftover?.aliveAtReturn?.length).length} | ${rs.filter((r) => r.stop?.escalated).length} | ${stat(port)} | ${rs.filter((r) => r.portMs === null || r.portMs > 3000).length} | ${q(rootExit, 0.5)} / ${q(rootExit, 1)} | ${q(treeDead, 0.5)} / ${q(treeDead, 1)} | ${rs.filter((r) => r.pipeHeld).length} | ${Math.max(0, ...rs.map((r) => r.leftover?.maxProcs ?? 0))} | ${[...codes].map(([k, v]) => `${k}×${v}`).join(" ")} |`,
    );
  }
  // 停止之后的下一次启动
  const after = records.filter((r) => "runAfter" in r || "runAfterReinstall" in r);
  if (after.length) {
    lines.push("");
    lines.push("停止之后的下一次启动：");
    const byKey = new Map();
    for (const r of after) {
      const key = `${r.runner} / ${r.method} / ${r.scenario}`;
      const g = byKey.get(key) ?? { n: 0, ok: 0, reinstallFail: 0, needCI: 0 };
      g.n++;
      if (r.runAfter === true || r.runAfterReinstall === true) g.ok++;
      if (r.reinstall && r.reinstall.code !== 0) g.reinstallFail++;
      if (r.reinstallWithCI?.code === 0) g.needCI++;
      byKey.set(key, g);
    }
    for (const [key, g] of byKey) lines.push(`- ${key}：${g.ok}/${g.n} 次下一次启动成功${g.reinstallFail ? `；原样重装失败 ${g.reinstallFail} 次，其中加 CI=true 后成功 ${g.needCI} 次` : ""}`);
  }
  const jobs = records.filter((r) => r.jobReport);
  if (jobs.length) {
    lines.push("");
    lines.push("Job Object 辅助程序的报告（Job 的成员表是权威的）：");
    const by = new Map();
    for (const r of jobs) {
      const key = `${r.runner} / ${r.method} / ${r.scenario}`;
      const g = by.get(key) ?? { n: 0, rootExitSeen: 0, activeMax: 0, activeSome: 0, emptyMax: 0, leftover: 0, ctrlc: 0, noConsole: 0 };
      g.n++;
      const j = r.jobReport;
      if ("activeAtRootExit" in j) g.rootExitSeen++;
      g.activeMax = Math.max(g.activeMax, Number(j.activeAtRootExit ?? 0));
      if (Number(j.activeAtRootExit ?? 0) > 0) g.activeSome++;
      g.emptyMax = Math.max(g.emptyMax, Number(j.msUntilEmpty ?? 0));
      if (Number(j.leftover ?? 0) > 0) g.leftover++;
      if (j.ctrlcSent === "1") g.ctrlc++;
      if (j.ownConsole === "0") g.noConsole++;
      by.set(key, g);
    }
    for (const [key, g] of by) lines.push(`- ${key}：${g.n} 次；辅助程序看到根进程退出 ${g.rootExitSeen} 次；根进程退出那一刻 Job 里还有别的进程 ${g.activeSome} 次（最多 ${g.activeMax} 个），最久 ${g.emptyMax} ms 后走光；到时限仍有残留 ${g.leftover} 次；Ctrl+C 已发出 ${g.ctrlc} 次；没拿到自己的控制台 ${g.noConsole} 次`);
  }
  const go = records.filter((r) => typeof r.goTmpLeft === "number");
  if (go.length) {
    lines.push("");
    lines.push("go run 停止后留下的 go-build 临时目录（每次停止留下几个）：");
    const by = new Map();
    for (const r of go) {
      const key = `${r.method} / ${r.scenario}`;
      const g = by.get(key) ?? { n: 0, left: 0 };
      g.n++;
      g.left += r.goTmpLeft;
      by.set(key, g);
    }
    for (const [key, g] of by) lines.push(`- ${key}：${g.n} 次停止，留下 ${g.left} 个`);
  }
  const trees = records.filter((r) => r.tree);
  if (trees.length) {
    lines.push("");
    lines.push("就绪时的进程树：");
    for (const r of trees) {
      lines.push(`- ${r.runner} / ${r.method} / ${r.scenario}（${r.tree.length} 个进程）`);
      for (const p of r.tree) lines.push(`  ${"  ".repeat(p.depth)}- \`${p.cmd.replaceAll("`", "'").replaceAll("|", "\\|")}\``);
    }
  }
  const transient = new Map();
  for (const r of records) for (const t of r.leftover?.transient ?? []) {
    const what = t.replace(/^\d+ /, "").replace(/\d{4,}/g, "N");
    transient.set(what, (transient.get(what) ?? 0) + 1);
  }
  if (transient.size) {
    lines.push("");
    lines.push("树外短命进程是谁（停止后自己很快退出的）：");
    for (const [what, count] of transient) lines.push(`- ${count} 次：\`${what}\``);
  }
  const bad = records.filter((r) => r.error || r.leftover?.survivors?.length || r.leftover?.untracked?.length || r.leftover?.byPort);
  if (bad.length) {
    lines.push("");
    lines.push("出错或有残留的记录（最多列 12 条）：");
    for (const r of bad.slice(0, 12)) lines.push(`- ${r.runner} / ${r.method} / ${r.scenario} #${r.i}：${r.error ?? ""} 残留=${JSON.stringify(r.leftover?.survivors ?? [])} 树外=${JSON.stringify(r.leftover?.untracked ?? [])} 按端口查到=${r.leftover?.byPort ?? "—"} 步骤=${JSON.stringify(r.stop?.steps ?? [])}`);
  }
  if (notes.length) {
    lines.push("");
    lines.push("备注：");
    for (const n of notes) lines.push(`- ${JSON.stringify(n).slice(0, 700)}`);
  }
  lines.push("");
  const sys = records.map((r) => r.leftover?.sysProcs).filter((v) => typeof v === "number");
  if (sys.length) lines.push(`整机进程数：第一次停止后 ${sys[0]}，最后一次停止后 ${sys[sys.length - 1]}，最多 ${Math.max(...sys)}；结束时相对开始时的变化：${meta.procGrowth || "无"}`);
  lines.push(`收尾：临时目录已删除=${meta.tmpRemoved}；全机扫描残留进程=${(meta.finalStray?.byCmdline ?? 0) + (meta.finalStray?.byCwd ?? 0)}`);
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of process.argv.slice(2)) console.log(`${summarize(JSON.parse(readFileSync(file, "utf8")))}\n`);
}
