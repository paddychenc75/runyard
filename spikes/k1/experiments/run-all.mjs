// 入口：依次跑全部实验，把结果写进 results/<系统>.json，并打印每项的判定和关键数字。
// 用法：node experiments/run-all.mjs [--quick] [--only 名字,名字] [--tag 标签]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spikeRoot } from "../lib/client.mjs";
import { electronExec, finalCleanup, SESSION } from "../lib/harness.mjs";
import { concurrency } from "./exp-concurrency.mjs";
import { appKill, appQuit, reconnect } from "./exp-lifetime.mjs";
import { startup, memoryAndDock, pathLength } from "./exp-measure.mjs";
import { staleRecovery, versionSkew } from "./exp-recovery.mjs";
import { otherUser, squatter } from "./exp-security.mjs";
import { hiddenWindows, parentExit } from "./exp-survival.mjs";

const argv = process.argv.slice(2);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const quick = argv.includes("--quick");
// spikes/k1/ci-only.txt（可选，一行逗号分隔的名字）：让 CI 的一轮只跑指定的实验，调试某一项时不必每次全跑
const onlyFile = path.join(spikeRoot, "ci-only.txt");
const only = (opt("only") ?? (process.env.GITHUB_ACTIONS && fs.existsSync(onlyFile) ? fs.readFileSync(onlyFile, "utf8").trim() : undefined))?.split(",");
const tag = opt("tag") ?? (process.env.GITHUB_ACTIONS ? "ci" : "local");

const experiments = { concurrency, appQuit, appKill, reconnect, parentExit, squatter, otherUser, hiddenWindows, staleRecovery, versionSkew, startup, memoryAndDock, pathLength };

const report = {
  tag,
  quick,
  session: SESSION,
  startedAt: new Date().toISOString(),
  env: {
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    osVersion: os.version(),
    cpus: `${os.cpus().length} x ${os.cpus()[0]?.model}`,
    totalMemGb: Math.round(os.totalmem() / 2 ** 30),
    node: process.version,
    electronExec: electronExec(),
    runnerImage: process.env.ImageOS ? `${process.env.ImageOS} ${process.env.ImageVersion}` : null,
  },
  results: {},
};

let crashed = 0;
for (const [name, fn] of Object.entries(experiments)) {
  if (only && !only.includes(name)) continue;
  const began = Date.now();
  process.stdout.write(`\n=== ${name} ===\n`);
  try {
    report.results[name] = { ...(await fn({ quick })), tookMs: Date.now() - began };
  } catch (err) {
    crashed++;
    report.results[name] = { pass: null, crashed: String(err.stack ?? err), tookMs: Date.now() - began };
  }
  const r = report.results[name];
  const verdict = r.skipped ? "跳过" : r.pass === true ? "通过" : r.pass === false ? "不通过" : "无判定";
  process.stdout.write(`${name}: ${verdict}（${r.tookMs} ms）\n${JSON.stringify(r, null, 1)}\n`);
}

report.cleanup = await finalCleanup();
report.finishedAt = new Date().toISOString();
process.stdout.write(`\n=== cleanup ===\n${JSON.stringify(report.cleanup, null, 1)}\n`);

const file = path.join(spikeRoot, "results", `${process.platform}-${process.arch}-${tag}${quick ? "-quick" : ""}${only ? "-partial" : ""}.json`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`\n=== summary (${process.platform}) ===\n`);
for (const [name, r] of Object.entries(report.results)) {
  process.stdout.write(`${name.padEnd(16)} ${r.skipped ? `skipped: ${r.skipped}` : r.crashed ? "CRASHED" : r.pass === true ? "pass" : r.pass === false ? "FAIL" : "n/a"}\n`);
}
process.stdout.write(`结果文件：${file}\n`);
const dirty = report.cleanup.processesAfter.length + report.cleanup.portsStillOpen.length + report.cleanup.dirsLeft.length;
process.exit(crashed > 0 || dirty > 0 ? 1 : 0);
