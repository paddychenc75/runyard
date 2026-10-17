import type { ReactNode } from "react";
import styles from "./RequestPanel.module.css";

// 整理过的 JSON 按设计稿上色：键用函数色，字符串用字符串色，数字用数字色，true / false / null 用关键字色
const TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

export function JsonText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    const [whole, string, colon, word] = match;
    const kind =
      string !== undefined
        ? colon !== undefined
          ? "key"
          : "string"
        : word !== undefined
          ? "keyword"
          : "number";
    const shown = string !== undefined ? string : whole;
    nodes.push(
      <span key={index++} className={styles[kind]}>
        {shown}
      </span>,
    );
    if (colon !== undefined) nodes.push(colon);
    last = at + whole.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}
