const { writeFileSync } = require("node:fs");
const { performance } = require("node:perf_hooks");

// 真stdout生产器：按时钟追目标速率，并记录实际完成写入的每秒行数，不以循环次数冒充吞吐。
const targetPerSecond = 30000;
const durationMs = 10000;
const began = performance.now();
const buckets = Array(10).fill(0);
let lines = 0;
let bytes = 0;
let backpressure = 0;
let writeWaitMs = 0;

function finish() {
  const elapsedMs = performance.now() - began;
  const result = {
    targetPerSecond,
    durationMs,
    elapsedMs,
    lines,
    bytes,
    buckets,
    backpressure,
    writeWaitMs,
  };
  writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
  process.stdout.write(`PERFORMANCE_DONE:${lines}\n`);
}

function produce() {
  const elapsed = performance.now() - began;
  if (elapsed >= durationMs) return finish();
  const desired = Math.floor((elapsed * targetPerSecond) / 1000);
  const count = Math.min(1000, desired - lines);
  if (count <= 0) return setTimeout(produce, 1);
  let chunk = "";
  for (let n = 1; n <= count; n++)
    chunk += `PERF_LINE:${lines + n}:abcdefghijklmnopqrstuvwxyz0123456789\n`;
  const waiting = performance.now();
  const accepted = process.stdout.write(chunk, () => {
    const completed = performance.now();
    lines += count;
    bytes += Buffer.byteLength(chunk);
    const bucket = Math.floor((completed - began) / 1000);
    buckets[bucket] = (buckets[bucket] ?? 0) + count;
    writeWaitMs += completed - waiting;
    setImmediate(produce);
  });
  if (!accepted) backpressure++;
}
produce();
