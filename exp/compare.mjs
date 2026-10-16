// 实验用：比较多个目录里同名 PNG 的字节与像素
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
const require = createRequire(process.argv[2]); // playwright-core 所在位置
const { PNG } = require("playwright-core/lib/utilsBundle");
const [, , , a, b] = process.argv;
let bytesDiff = 0, pixDiff = 0, total = 0;
for (const f of readdirSync(a).filter((x) => x.endsWith(".png")).sort()) {
  total++;
  const ba = readFileSync(join(a, f)), bb = readFileSync(join(b, f));
  if (ba.equals(bb)) continue;
  bytesDiff++;
  const pa = PNG.sync.read(ba), pb = PNG.sync.read(bb);
  if (pa.width !== pb.width || pa.height !== pb.height) { console.log(f, "SIZE", pa.width, pa.height, pb.width, pb.height); pixDiff++; continue; }
  let n = 0, max = 0;
  for (let i = 0; i < pa.data.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(pa.data[i + c] - pb.data[i + c]));
    if (d) { n++; if (d > max) max = d; }
  }
  if (n) pixDiff++;
  console.log(f, "bytes differ; pixels differing:", n, "max channel diff:", max);
}
console.log(`${a} vs ${b}: ${total} files, bytes differ ${bytesDiff}, pixels differ ${pixDiff}`);
