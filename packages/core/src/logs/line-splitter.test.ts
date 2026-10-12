import { describe, expect, it } from "vitest";
import { createLineSplitter } from "./line-splitter.ts";

const enc = new TextEncoder();
const make = (stream: "stdout" | "stderr" = "stdout") => {
  let t = 0;
  return createLineSplitter({ stream, now: () => ++t });
};
const texts = (entries: { kind: string; text?: string }[]) => entries.map((e) => e.text);

describe("line-splitter", () => {
  it("[RUN-LOGS-01] 半行跨数据块：第二块带行尾后只有一条完整的行", () => {
    const s = make();
    expect(s.push(enc.encode("hel"))).toEqual([]);
    const out = s.push(enc.encode("lo\nnext"));
    expect(texts(out)).toEqual(["hello"]);
    expect(s.end().map((e) => (e.kind === "stdout" ? e.text : ""))).toEqual(["next"]);
  });

  it("[RUN-LOGS-02] 进程结束时没有换行的残行作为最后一条写入", () => {
    const s = make("stderr");
    expect(s.push(enc.encode("a\nlast"))).toHaveLength(1);
    const rest = s.end();
    expect(rest).toEqual([{ at: 2, kind: "stderr", text: "last" }]);
    expect(s.end()).toEqual([]);
  });

  it("[RUN-LOGS-03] 不是合法 UTF-8 但是合法 GB18030 的行解出正确中文", () => {
    // “中文输出”的 GBK 字节
    const gbk = Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4, 0xca, 0xe4, 0xb3, 0xf6, 0x0a]);
    const out = make().push(gbk);
    expect(texts(out)).toEqual(["中文输出"]);
  });

  it("[RUN-LOGS-03] 同一路里 UTF-8 行与 GBK 行交替，GBK 汉字被拆在两块之间", () => {
    const s = make();
    const first = s.push(Uint8Array.from([...enc.encode("好\n"), 0xd6]));
    const second = s.push(Uint8Array.from([0xd0, 0x0a]));
    expect(texts([...first, ...second])).toEqual(["好", "中"]);
  });

  it("UTF-8 汉字的字节被拆在两块之间不损坏", () => {
    const bytes = enc.encode("汉字\n");
    const s = make();
    expect(s.push(bytes.subarray(0, 1))).toEqual([]);
    expect(texts(s.push(bytes.subarray(1)))).toEqual(["汉字"]);
  });

  it("[RUN-LOGS-04] 颜色码、回车、字节序标记原样保留", () => {
    const line = `${String.fromCodePoint(0xfeff)}\u001b[31merror\u001b[0m\r`;
    const out = make().push(enc.encode(`${line}\n`));
    expect(texts(out)).toEqual([line]);
  });

  it("CR 与 LF 被拆在两块里仍是一行，CR 留在行尾", () => {
    const s = make();
    expect(s.push(enc.encode("ab\r"))).toEqual([]);
    expect(texts(s.push(enc.encode("\n")))).toEqual(["ab\r"]);
  });

  it("两路各有一个切行器，半行互不串", () => {
    const out = make("stdout");
    const err = make("stderr");
    out.push(enc.encode("o1"));
    err.push(enc.encode("e1"));
    expect(out.end()[0]).toMatchObject({ kind: "stdout", text: "o1" });
    expect(err.end()[0]).toMatchObject({ kind: "stderr", text: "e1" });
  });

  it("2 万行批量用例逐字节喂入，行数和内容都不变", () => {
    const lines = Array.from({ length: 20000 }, (_, i) => `\u001b[32m第${i}行 ok\u001b[0m`);
    const bytes = enc.encode(`${lines.join("\n")}\n`);
    const s = make();
    const got: string[] = [];
    // 以 7 字节为块，让块边界落在汉字和转义序列中间
    for (let i = 0; i < bytes.length; i += 7) {
      for (const e of s.push(bytes.subarray(i, i + 7))) if (e.kind === "stdout") got.push(e.text);
    }
    expect(s.end()).toEqual([]);
    expect(got).toEqual(lines);
  });
});
