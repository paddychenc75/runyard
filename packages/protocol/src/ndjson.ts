// 一行一个 JSON 对象的分帧（技术设计 §5.1）。只处理字符串：把字节解码成 UTF-8
// 是连接那一侧的事（protocol 里没有 Node 和浏览器的接口，也就没有 TextDecoder 的类型）。

// 单行上限 8 MB，按 UTF-8 字节数算，不含结尾的换行
export const MAX_LINE_BYTES = 8 * 1024 * 1024;

// 字符串编成 UTF-8 后的字节数。孤立的代理项在 UTF-8 编码时会变成 3 字节的替换符，这里同样按 3 算
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

export class LineTooLargeError extends Error {
  constructor() {
    super(`line exceeds ${MAX_LINE_BYTES} bytes`);
    this.name = "LineTooLargeError";
  }
}

// 发送：把一个值编成一行。超过上限就抛错，不把过大的行写到连接上
export function encodeLine(value: unknown): string {
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError("value is not JSON-serializable");
  if (utf8ByteLength(text) > MAX_LINE_BYTES) throw new LineTooLargeError();
  return `${text}\n`;
}

export type LineResult =
  | { ok: true; value: unknown }
  // invalid-json：这一行不是合法 JSON，已丢弃，后面的行照常处理
  // too-large：单行超限，接收方必须关闭连接；之后解码器不再产出任何东西
  | { ok: false; reason: "invalid-json" | "too-large" };

export interface LineDecoder {
  push(chunk: string): LineResult[];
}

// 接收：分块喂入，按换行切行。没有换行的半行留在内部；半行一旦超限立刻报错，
// 不等换行到来，否则对方不发换行就能把内存撑满。
// 永远不抛错：任何输入都变成结果。
export function createLineDecoder(maxBytes: number = MAX_LINE_BYTES): LineDecoder {
  let pending = "";
  let pendingBytes = 0;
  let closed = false;

  return {
    push(chunk) {
      if (closed) return [];
      const results: LineResult[] = [];
      let start = 0;
      while (start <= chunk.length) {
        const newline = chunk.indexOf("\n", start);
        const piece = newline === -1 ? chunk.slice(start) : chunk.slice(start, newline);
        // 半行的末尾和下一块开头可能把一个代理对劈开，各自按 3 字节算会偏大一点；
        // 偏大只会让上限判得略早（最多差几个字节），不会放过超限的行
        const total = pendingBytes + utf8ByteLength(piece);
        if (total > maxBytes) {
          closed = true;
          pending = "";
          results.push({ ok: false, reason: "too-large" });
          return results;
        }
        if (newline === -1) {
          pending += piece;
          pendingBytes = total;
          return results;
        }
        const line = pending + piece;
        pending = "";
        pendingBytes = 0;
        // 容忍 \r\n，空行忽略
        const text = line.endsWith("\r") ? line.slice(0, -1) : line;
        if (text.length > 0) {
          try {
            results.push({ ok: true, value: JSON.parse(text) });
          } catch {
            results.push({ ok: false, reason: "invalid-json" });
          }
        }
        start = newline + 1;
      }
      return results;
    },
  };
}
