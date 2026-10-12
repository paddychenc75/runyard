import { describe, expect, it } from "vitest";
import {
  createLineDecoder,
  encodeLine,
  type LineResult,
  LineTooLargeError,
  MAX_LINE_BYTES,
  utf8ByteLength,
} from "./ndjson.ts";

describe("encodeLine", () => {
  it("编成一行 JSON，以换行结尾", () => {
    expect(encodeLine({ a: 1 })).toBe('{"a":1}\n');
  });

  it("换行和非 ASCII 字符被转义或保留在同一行里", () => {
    const line = encodeLine({ text: "a\nb 中文" });
    expect(line.indexOf("\n")).toBe(line.length - 1);
  });

  it("不能序列化的值抛 TypeError", () => {
    expect(() => encodeLine(undefined)).toThrow(TypeError);
  });

  it("[PROTOCOL-HANDSHAKE-19] 超过 8 MB 的行发送时抛 LineTooLargeError", () => {
    expect(() => encodeLine({ s: "x".repeat(MAX_LINE_BYTES) })).toThrow(LineTooLargeError);
  });
});

describe("utf8ByteLength", () => {
  it("与 UTF-8 编码的字节数一致", () => {
    // 期望值是手算的 UTF-8 字节数（中立环境里没有 TextEncoder 的类型）
    const cases: [string, number][] = [
      ["", 0],
      ["abc", 3],
      ["é", 2],
      ["中文", 6],
      ["😀", 4],
      ["a😀中é", 10],
    ];
    for (const [text, bytes] of cases) expect(utf8ByteLength(text)).toBe(bytes);
  });

  it("孤立代理项按替换符的 3 字节算", () => {
    expect(utf8ByteLength("\ud800")).toBe(3);
    expect(utf8ByteLength("\udc00x")).toBe(4);
  });
});

describe("createLineDecoder", () => {
  it("一块里有多行", () => {
    const d = createLineDecoder();
    expect(d.push('{"a":1}\n{"b":2}\n')).toEqual([
      { ok: true, value: { a: 1 } },
      { ok: true, value: { b: 2 } },
    ]);
  });

  it("一行被劈成多块也能拼起来", () => {
    const d = createLineDecoder();
    expect(d.push('{"a"')).toEqual([]);
    expect(d.push(":1}")).toEqual([]);
    expect(d.push("\n")).toEqual([{ ok: true, value: { a: 1 } }]);
  });

  it("不合法的 JSON 只丢这一行，后面的行照常", () => {
    const d = createLineDecoder();
    expect(d.push("{oops\n[1]\n")).toEqual([
      { ok: false, reason: "invalid-json" },
      { ok: true, value: [1] },
    ]);
  });

  it("空行忽略，\\r\\n 也能处理", () => {
    const d = createLineDecoder();
    expect(d.push('\n\n{"a":1}\r\n')).toEqual([{ ok: true, value: { a: 1 } }]);
  });

  it("[PROTOCOL-HANDSHAKE-19] 半行超限立刻报 too-large，不等换行，之后不再产出", () => {
    const d = createLineDecoder(10);
    expect(d.push("x".repeat(6))).toEqual([]);
    expect(d.push("y".repeat(6))).toEqual([{ ok: false, reason: "too-large" }]);
    expect(d.push('{"a":1}\n')).toEqual([]);
  });

  it("[PROTOCOL-HANDSHAKE-19] 恰好等于上限的行可以通过，多一个字节就超限", () => {
    const max = 12; // `"` + 10 个字符 + `"`
    const ok = createLineDecoder(max);
    expect(ok.push(`"${"x".repeat(10)}"\n`)).toEqual([{ ok: true, value: "x".repeat(10) }]);
    const over = createLineDecoder(max);
    expect(over.push(`"${"x".repeat(11)}"\n`)).toEqual([{ ok: false, reason: "too-large" }]);
  });

  it("上限按 UTF-8 字节算，不是按字符", () => {
    const d = createLineDecoder(8);
    // 6 个汉字是 18 字节
    expect(d.push('"中中中中中中"\n')).toEqual([{ ok: false, reason: "too-large" }]);
  });

  it("默认上限是 8 MB", () => {
    expect(MAX_LINE_BYTES).toBe(8 * 1024 * 1024);
  });

  it("[PROTOCOL-HANDSHAKE-19] 恰好 8 MB 的一行分 64 KB 块喂入能解出来，再多一个字节就 too-large", () => {
    // 单独的大输入用例，只跑一次，实测约 20 毫秒；属性测试不再生成大输入
    const body = "x".repeat(MAX_LINE_BYTES - 2);
    const feed = (text: string) => {
      const d = createLineDecoder();
      const out: LineResult[] = [];
      for (let i = 0; i < text.length; i += 65536) out.push(...d.push(text.slice(i, i + 65536)));
      return out;
    };
    expect(feed(`"${body}"\n`)).toEqual([{ ok: true, value: body }]);
    expect(feed(`"${body}x"\n`)).toEqual([{ ok: false, reason: "too-large" }]);
  });
});

// 随机输入不能让解码器抛出未处理的异常。没有引入属性测试库（不新增依赖），
// 用固定种子的伪随机数生成输入，保证每次跑都一样
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("属性：任意输入不让解码器抛错", () => {
  it("随机字符串（含孤立代理项、换行、引号）按随机切块喂入", () => {
    const rand = mulberry32(20261012);
    const alphabet = [
      '"',
      "{",
      "}",
      "[",
      "]",
      ",",
      ":",
      "\n",
      "\r",
      "\\",
      "\ud800",
      "\udc00",
      "中",
      "😀",
      "a",
      "1",
      " ",
      "\0",
    ];
    let pushes = 0;
    for (let round = 0; round < 2000; round++) {
      const decoder = createLineDecoder(64);
      const length = Math.floor(rand() * 200);
      let text = "";
      for (let i = 0; i < length; i++) {
        text +=
          rand() < 0.7
            ? (alphabet[Math.floor(rand() * alphabet.length)] ?? "")
            : String.fromCharCode(Math.floor(rand() * 0x10000));
      }
      // 每个块不单独断言：两万次 expect 比解码本身慢十倍，是这个测试耗时的主要来源。
      // 抛错会直接让测试失败，断言只留一处（对尾部的产出形状）
      let pos = 0;
      while (pos < text.length) {
        const size = 1 + Math.floor(rand() * 20);
        for (const result of decoder.push(text.slice(pos, pos + size))) {
          if (!result.ok && result.reason !== "invalid-json" && result.reason !== "too-large") {
            throw new Error(`unexpected result ${JSON.stringify(result)}`);
          }
        }
        pos += size;
        pushes++;
      }
    }
    expect(pushes).toBeGreaterThan(10000);
  });
});
