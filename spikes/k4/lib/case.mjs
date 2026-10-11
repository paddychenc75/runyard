// 跑一个实验用例：启动、（可选）驱动、收尾，写出原始字节日志和纯文本日志，返回一条结果记录。
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { startCapture } from "./capture.mjs";
import { census, textHealth, tickLatency, orderInversions, boundarySplits } from "./analyze.mjs";
import { toPlainLines } from "./plain-text.mjs";

export async function runCase(ctx, spec) {
  const { id, tool, scenario, profile, run, drive, markers = [], timeoutMs = 120000, tick, order, rep } = spec;
  const name = `${id}${rep !== undefined ? `.r${rep}` : ""}`.replace(/[^\w.\-]+/g, "_");
  const rec = { id: name, tool, scenario, profile, command: [run.cmd, ...run.args].join(" "), cwd: run.cwd, envDelta: spec.envDelta ?? {} };
  const t0 = Date.now();
  let h;
  try {
    h = startCapture(run);
    let driveResult = {};
    const timer = setTimeout(() => {
      rec.timedOut = true;
      h.kill(true);
    }, timeoutMs);
    if (drive) {
      try {
        driveResult = (await drive(h)) ?? {};
      } catch (e) {
        rec.driveError = String(e.message ?? e);
      }
      h.kill(!!spec.force); // 默认与“停止项目”一致：POSIX 先 SIGTERM，Windows 直接强制；force 用于“被强杀会丢几行”的实验
    }
    const exit = await h.finish(drive ? 6000 : 20000);
    clearTimeout(timer);
    if (spec.port) rec.portStillOpenAfterStop = await portOpen(spec.port);
    Object.assign(rec, { exit: { code: exit.code, signal: exit.signal, pipesClosed: exit.pipesClosed !== false, error: exit.error }, driveResult });
  } catch (e) {
    rec.fatal = String(e.message ?? e);
    return finalize(ctx, rec, name, h?.chunks ?? [], spec, t0);
  }
  return finalize(ctx, rec, name, h.chunks, spec, t0);
}

function finalize(ctx, rec, name, chunks, spec, t0) {
  const lines = toPlainLines(chunks);
  const plain = lines.map((l) => `${String(l.seq).padStart(4)} ${l.src === "stderr" ? "E" : "O"} ${l.text}`).join("\n");
  mkdirSync(ctx.rawDir, { recursive: true });
  writeFileSync(path.join(ctx.rawDir, `${name}.raw.bin`), Buffer.concat(chunks.map((c) => c.buf)));
  writeFileSync(path.join(ctx.rawDir, `${name}.chunks.json`), JSON.stringify(chunks.map((c) => ({ tMs: +c.t.toFixed(1), src: c.src, bytes: c.buf.length })), null, 0));
  writeFileSync(path.join(ctx.rawDir, `${name}.plain.txt`), plain + "\n");
  const all = lines.map((l) => l.text).join("\n");
  rec.durationMs = Date.now() - t0;
  rec.chunkCount = chunks.length;
  rec.census = census(chunks);
  rec.health = textHealth(lines);
  rec.splits = boundarySplits(chunks);
  rec.encodings = [...new Set(lines.map((l) => l.encoding))];
  rec.markers = Object.fromEntries((spec.markers ?? []).map((m) => [m, all.includes(m)]));
  if (spec.tick) rec.latency = tickLatency(chunks);
  if (spec.order) rec.order = orderInversions(chunks);
  if (spec.keepFirstLines) rec.sample = lines.slice(0, spec.keepFirstLines).map((l) => `${l.src === "stderr" ? "E" : "O"} ${l.text}`);
  rec.plainLineCount = lines.length;
  ctx.results.push(rec);
  const c = rec.census.counts;
  console.log(
    `[${rec.scenario}] ${rec.id} exit=${rec.exit?.code ?? rec.exit?.signal ?? "-"} ${rec.durationMs}ms bytes=${rec.census.rawBytes} ` +
      `ctl=${JSON.stringify(c)} residual=${rec.health.residualLines} fffd=${rec.health.fffdLines} markers=${JSON.stringify(rec.markers)}` +
      (rec.latency ? ` lat=${JSON.stringify(rec.latency)}` : "") +
      (rec.order ? ` inv=${rec.order.inversions}` : "") +
      (rec.driveError ? ` DRIVE_ERROR=${rec.driveError}` : "") +
      (rec.fatal ? ` FATAL=${rec.fatal}` : ""),
  );
  return rec;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
    setTimeout(() => (s.destroy(), resolve(false)), 2000);
  });
}
