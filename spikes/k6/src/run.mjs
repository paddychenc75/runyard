// 入口：node src/run.mjs <suite> [suite...]    suite = matrix | messy | real | finder | timing | gui | project | all
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CASES } from "./cases.mjs";
import { isGood, runCase, shellPath } from "./lab.mjs";
import { runMessy } from "./messy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.K6_OUT || path.join(HERE, "..", "results");
mkdirSync(OUT, { recursive: true });
const save = (name, data) => writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data, null, 2));

const SHELL_KINDS = ["zsh", "bash", "fish"].filter((k) => shellPath(k));
const fmtRes = (r) => (typeof r === "string" ? r : Object.entries(r).map(([k, v]) => `${k}=${v}`).join(" "));

async function matrix() {
  const rows = [];
  for (const def of CASES) {
    for (const kind of SHELL_KINDS) {
      for (const cwdMode of def.project ? ["home", "project"] : ["home"]) {
        const r = await runCase(def, kind, { cwdMode });
        if (r.skipped) continue;
        rows.push(r);
        const ok = typeof r.resolver !== "string" && Object.values(r.resolver).every(isGood);
        console.log(`${ok ? "OK  " : "DIFF"} ${def.id} [${kind}/${cwdMode}] ${Math.round(r.meta.ms)}ms\n   naive:    ${fmtRes(r.naive)}\n   resolver: ${fmtRes(r.resolver)}\n   scan:     ${fmtRes(r.scan)}`);
      }
    }
  }
  save("matrix", rows);
  return rows;
}

async function messy() {
  if (shellPath("zsh") && process.platform === "darwin") { try { (await import("node:fs")).accessSync("/opt/homebrew/bin/starship"); process.env.K6_HAVE_STARSHIP = "1"; } catch {} }
  const rows = await runMessy(SHELL_KINDS);
  save("messy", rows);
}
import * as X from "./suites.mjs";
const suites = {
  matrix, messy,
  "real-managers": async () => { const { runReal } = await import("./real-managers.mjs"); const rows = await runReal(SHELL_KINDS); save("real-managers", rows.map(({ ctx, ...r }) => r)); },
  real: async () => save("real", await X.real()),
  finder: async () => save("finder", await X.finder()),
  gui: async () => save("gui", await X.gui()),
  timing: async () => save("timing", await X.timing(Number(process.env.K6_N || 25))),
  ablation: async () => save("ablation", await X.ablation(SHELL_KINDS)),
  project: async () => save("project", await X.projectCwd(SHELL_KINDS)),
  score: async () => { const { readFileSync } = await import("node:fs"); const r = X.score(JSON.parse(readFileSync(path.join(OUT, "matrix.json"), "utf8"))); console.log(JSON.stringify(r, null, 1)); save("score", r); },
};
const want = process.argv.slice(2);
for (const s of want.length ? want : ["matrix"]) {
  if (!suites[s]) { console.error("unknown suite", s); process.exit(2); }
  await suites[s]();
}
