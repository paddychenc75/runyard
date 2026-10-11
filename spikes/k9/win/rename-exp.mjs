// K9b 实验 3：改名的边界情况（支撑 PRD 的命名规则）。全部在临时根内。
import fs from "node:fs";
import path from "node:path";
import * as G from "../lib/guard.mjs";

export function renameEdgeCases(root) {
  const out = {};
  const tryRename = (label, from, to) => {
    G.assertInRoot(from);
    try {
      fs.renameSync(from, to);
      out[label] = { ok: true, listed: fs.readdirSync(path.dirname(from)).filter((n) => n.toLowerCase().startsWith(path.basename(to).replace(/[. ]+$/, "").toLowerCase().slice(0, 6))) };
    } catch (e) {
      out[label] = { ok: false, code: e.code };
    }
  };
  let k = 0;
  const moveAway = (p) => {
    try {
      fs.renameSync("\\\\?\\" + p, path.join(root, `moved-${k++}`));
    } catch (e) {
      out[`(could not move away ${path.basename(p)})`] = { code: e.code };
    }
  };
  const mk = (n) => {
    const d = path.join(root, n);
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, "f.txt"), "x");
    return d;
  };
  // 仅大小写不同
  let d = mk("Demo");
  tryRename("case-only Demo->demo", d, path.join(root, "demo"));
  // 保留设备名：用 \\?\ 前缀和不用各试一次
  for (const n of ["con", "nul", "com1", "CON.txt", "aux", "lpt1"]) {
    d = mk("src-" + n.replace(/\W/g, ""));
    tryRename(`reserved ${n}`, d, path.join(root, n));
    moveAway(path.join(root, n)); // 挪开，免得下一个变体撞上已存在的目标
    d = mk("srcx-" + n.replace(/\W/g, ""));
    tryRename(`reserved ${n} (\\\\?\\ prefix)`, d, "\\\\?\\" + path.join(root, n));
    moveAway(path.join(root, n));
  }
  // 末尾的点和空格
  for (const [label, n] of [["trailing dot", "foo."], ["trailing space", "bar "], ["trailing dots", "baz.."]]) {
    d = mk("t-" + label.replace(/\W/g, ""));
    tryRename(label, d, path.join(root, n));
    moveAway(path.join(root, n));
    d = mk("tx-" + label.replace(/\W/g, ""));
    tryRename(`${label} (\\\\?\\ prefix)`, d, "\\\\?\\" + path.join(root, n));
  }
  // 其他非法字符（Windows 文件名里不许有）
  for (const c of ["a:b", "a*b", "a?b", 'a"b', "a<b", "a|b"]) {
    d = mk("c-" + c.charCodeAt(1));
    tryRename(`illegal char ${c}`, d, path.join(root, c));
  }
  // 超长名字（单段 > 255）
  d = mk("longname-src");
  tryRename("single segment 300 chars", d, path.join(root, "x".repeat(300)));
  // 目标路径超过 260（\\?\ 前缀 / 不带）
  d = mk("longpath-src");
  const longTarget = path.join(root, "y".repeat(100), "y".repeat(100), "y".repeat(100));
  fs.mkdirSync(path.dirname(longTarget), { recursive: true });
  tryRename(`move into path of ${longTarget.length} chars`, d, longTarget);
  return out;
}
