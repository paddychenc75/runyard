import { describe, expect, it } from "vitest";
import { cleanLogEntries, cleanLogText } from "./clean-log-text.ts";

const ESC = "\u001b";
const BOM = String.fromCodePoint(0xfeff);

// 带固定种子的伪随机数（mulberry32），保证属性测试可复现
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("clean-log-text", () => {
  it("[RUN-LOGS-05] 带颜色码的红色 error 清洗成纯文本", () => {
    expect(cleanLogText(`${ESC}[31merror${ESC}[0m`)).toBe("error");
  });

  it("[RUN-LOGS-06] 进度条用回车反复重绘，只留最后一段", () => {
    expect(cleanLogText("10%\r50%\r100%")).toBe("100%");
    expect(cleanLogText("10%\r50%\r100%\r")).toBe("100%");
    expect(cleanLogText("50%\r100%\r\r")).toBe("100%");
  });

  it("[RUN-LOGS-07] 只有清屏序列的行被丢弃", () => {
    expect(cleanLogText(`${ESC}[2J${ESC}[H`)).toBeNull();
    expect(
      cleanLogEntries([
        { at: 1, kind: "stdout", text: `${ESC}[2J${ESC}[3J${ESC}[H` },
        { at: 2, kind: "stdout", text: "kept" },
      ]),
    ).toEqual([{ at: 2, kind: "stdout", text: "kept" }]);
  });

  it("[RUN-LOGS-07] 原本的空行保留", () => {
    expect(cleanLogText("")).toBe("");
    expect(cleanLogEntries([{ at: 1, kind: "stderr", text: "" }])).toHaveLength(1);
  });

  it("[RUN-LOGS-08] 字节序标记开头、退格删前一个字符、制表符保留", () => {
    expect(cleanLogText(`${BOM}ab\bc\td`)).toBe("ac\td");
  });

  it("退格不把代理对删成半个，行首退格无副作用", () => {
    expect(cleanLogText("a😀\b")).toBe("a");
    expect(cleanLogText("\bx")).toBe("x");
  });

  it("去一个行尾 CR（CRLF 残留）", () => {
    expect(cleanLogText("done\r")).toBe("done");
  });

  it("ESC[1G、ESC[G、ESC[0G 当作回车", () => {
    expect(cleanLogText(`old${ESC}[1Gnew`)).toBe("new");
    expect(cleanLogText(`old${ESC}[Gnew`)).toBe("new");
    expect(cleanLogText(`old${ESC}[0Gnew`)).toBe("new");
  });

  it("OSC 8 超链接以 BEL 或 ESC \\ 结尾都剥掉，文字保留", () => {
    const bel = `${ESC}]8;;https://example.com\u0007link${ESC}]8;;\u0007`;
    const st = `${ESC}]8;;https://example.com${ESC}\\link${ESC}]8;;${ESC}\\`;
    expect(cleanLogText(bel)).toBe("link");
    expect(cleanLogText(st)).toBe("link");
  });

  it("未结束的 OSC 吃到行尾", () => {
    expect(cleanLogText(`a${ESC}]0;title without end`)).toBe("a");
  });

  it("光标、私有模式、DCS、8 位 CSI 都剥掉", () => {
    expect(cleanLogText(`${ESC}[?25h${ESC}[1Aok${ESC}[2K`)).toBe("ok");
    expect(cleanLogText(`${ESC}Pq data${ESC}\\x`)).toBe("x");
    expect(cleanLogText("\u009b31mred\u009b0m")).toBe("red");
    expect(cleanLogText(`${ESC}(Bx${ESC}=y`)).toBe("xy");
  });

  it("删除剩余控制字符，保留制表符", () => {
    expect(cleanLogText("a\u0000b\u0007c\u007fd\u0085e\tf")).toBe("abcde\tf");
  });

  it("Vite 报错框（带颜色码、CRLF）清洗后得到可读文字，纯着色空行被丢弃", () => {
    const frame = [
      `${ESC}[31mX [ERROR] Expected ";" but found "}"${ESC}[0m`,
      `${ESC}[0m`,
      `    ${ESC}[37msrc/App.tsx:3:10:${ESC}[0m`,
      `${ESC}[37m      3 │ ${ESC}[32mconst a = ${ESC}[0m}\r`,
    ];
    const entries = frame.map((text, i) => ({ at: i, kind: "stderr" as const, text }));
    expect(cleanLogEntries(entries).map((e) => (e.kind === "stderr" ? e.text : ""))).toEqual([
      'X [ERROR] Expected ";" but found "}"',
      "    src/App.tsx:3:10:",
      "      3 │ const a = }",
    ]);
  });

  it("Vite 报错框全部是着色空行时清洗后为空", () => {
    const entries = [`${ESC}[31m${ESC}[1m`, `${ESC}[0m\r`].map((text, at) => ({
      at,
      kind: "stdout" as const,
      text,
    }));
    expect(cleanLogEntries(entries)).toEqual([]);
  });

  it("命令和系统条目原样返回", () => {
    const entries = [
      { at: 1, kind: "command" as const, text: `${ESC}[1mpnpm dev` },
      { at: 2, kind: "system" as const, notice: { code: "PORT_FALLBACK" as const, params: {} } },
    ];
    // 类型断言：notice 形状由 protocol 校验，这里只关心不被改动
    expect(cleanLogEntries(entries as never)).toEqual(entries);
  });

  it("[RUN-LOGS-09] 手写样例清洗两次结果不变", () => {
    const samples = [
      `${BOM}${ESC}[31mred${ESC}[0m\b!\r`,
      `${ESC}[0m${BOM}x`,
      "a\r﻿b",
      `${BOM}${BOM}${ESC}[1G${BOM}y`,
      `${ESC}[3${ESC}[0m1m`,
      "p1\rp2\r",
      `${ESC}`,
    ];
    for (const s of samples) {
      const once = cleanLogText(s);
      if (once !== null) expect(cleanLogText(once)).toBe(once);
    }
  });

  it("[RUN-LOGS-09] 属性测试（固定种子）：任意输入不抛异常且幂等", () => {
    const random = rng(20261012);
    const pieces = [
      ESC,
      "[",
      "]",
      "\\",
      "P",
      "m",
      "G",
      "1",
      "0",
      ";",
      "?",
      "\u0007",
      "\r",
      "\n",
      "\b",
      "\t",
      BOM,
      "\u009b",
      "\u009d",
      "\u009c",
      "\u0000",
      "\u007f",
      "a",
      "b",
      " ",
      "中",
      "😀",
      "\ud83d",
      "\u0085",
    ];
    for (let n = 0; n < 5000; n += 1) {
      const len = Math.floor(random() * 24);
      let s = "";
      for (let i = 0; i < len; i += 1) s += pieces[Math.floor(random() * pieces.length)];
      const once = cleanLogText(s);
      if (once !== null) {
        expect(cleanLogText(once), JSON.stringify(s)).toBe(once);
        expect([...once].some((c) => c !== "\t" && /\p{Cc}/u.test(c))).toBe(false);
      }
    }
  });

  it("2 万行批量用例清洗后没有控制字符残留", () => {
    for (let i = 0; i < 20000; i += 1) {
      const out = cleanLogText(`${ESC}[32m第${i}行 ok${ESC}[0m`);
      expect(out).toBe(`第${i}行 ok`);
    }
  });
});
