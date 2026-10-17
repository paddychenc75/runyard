import type { LineEnding } from "../../shared/editor-files.ts";

// 文本判定与换行符处理。读出来的内容不动，换行符另外报告；写回时按文件原来的换行统一，
// 所以界面只改了一行，磁盘上其余字节不变（规格 DESKTOP-EDITOR-30）。

const SNIFF_BYTES = 8192;

/** 文本：前 8 KB 里没有 NUL，且整个文件是合法的 UTF-8。返回解码后的内容，不是文本返回 null */
export function decodeText(bytes: Uint8Array): string | null {
  const head = bytes.subarray(0, SNIFF_BYTES);
  if (head.includes(0)) return null;
  try {
    // ignoreBOM：保留开头的 BOM，写回时原样带上
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function detectLineEnding(text: string): LineEnding {
  let crlf = 0;
  let lf = 0;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
    if (i > 0 && text[i - 1] === "\r") crlf += 1;
    else lf += 1;
  }
  if (crlf > 0 && lf > 0) return "mixed";
  if (crlf > 0) return "crlf";
  if (lf > 0) return "lf";
  return "none";
}

/** 把全部换行统一成指定的一种；单独的 `\r` 不碰。不指定就原样 */
export function applyLineEnding(text: string, eol: "lf" | "crlf" | undefined): string {
  if (eol === undefined) return text;
  const unified = text.replace(/\r\n/g, "\n");
  return eol === "lf" ? unified : unified.replace(/\n/g, "\r\n");
}
