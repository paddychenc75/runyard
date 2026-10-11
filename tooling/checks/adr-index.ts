import { ADR_DIR, listFiles, proseLines, readText } from "./docs.ts";
import type { Check } from "./workspace.ts";

// adr-index：决策记录（ADR）的编号、状态和格式合法（技术设计 §9.1、§9.4）。
// 写法见 docs/guides/write-an-adr.md。规则：
// 文件名 NNNN-kebab-case.md，编号从 0001 起连续、不重复；第一行 “# NNNN. 标题”；
// 有 状态：、日期：、来源： 三行；状态只能是 提议中 / 已接受 / 已被 NNNN 取代（NNNN 必须存在）；
// 有 背景、决定、后果、被否的方案 四节，顺序不变。

const GUIDE = "docs/guides/write-an-adr.md";
const SECTIONS = ["背景", "决定", "后果", "被否的方案"];

const pad = (n: number) => String(n).padStart(4, "0");

export function checkAdrFile(file: string, text: string, numbers: Set<number>): string[] {
  const errors: string[] = [];
  const number = Number(/(\d{4})-/.exec(file)?.[1]);
  const lines = text.split("\n");
  if (!new RegExp(`^# ${pad(number)}\\. \\S`).test(lines[0] ?? "")) {
    errors.push(`${file} 的第一行必须是 “# ${pad(number)}. 标题”，编号和文件名一致。`);
  }
  const field = (name: string) =>
    lines
      .find((line) => line.startsWith(`${name}：`))
      ?.slice(name.length + 1)
      .trim();
  const status = field("状态");
  const superseded = /^已被 (\d{4}) 取代$/.exec(status ?? "");
  if (status !== "提议中" && status !== "已接受" && superseded === null) {
    errors.push(
      `${file} 的 “状态：” 一行不合法（现在是 ${status ?? "没有这一行"}）。只能写：提议中、已接受、已被 NNNN 取代。`,
    );
  } else if (superseded !== null && !numbers.has(Number(superseded[1]))) {
    errors.push(`${file} 写着已被 ${superseded[1]} 取代，但没有编号 ${superseded[1]} 的记录。`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(field("日期") ?? "")) {
    errors.push(`${file} 缺 “日期：YYYY-MM-DD” 一行，或日期格式不对。`);
  }
  if ((field("来源") ?? "") === "") {
    errors.push(
      `${file} 缺 “来源：” 一行。写明这个决定出自哪里：PRD 的锚点（PRD #prd-…）或技术设计的章节。`,
    );
  }
  const headings = proseLines(text)
    .map((line) => /^##\s+(.+?)\s*$/.exec(line)?.[1])
    .filter((heading) => heading !== undefined && SECTIONS.includes(heading));
  if (headings.join("|") !== SECTIONS.join("|")) {
    errors.push(
      `${file} 的章节不对。需要这四个二级标题并按这个顺序：${SECTIONS.map((s) => `## ${s}`).join("、")}。`,
    );
  }
  return errors;
}

export const adrIndex: Check = {
  name: "adr-index",
  run(root) {
    const files = listFiles(root).filter(
      (file) => file.startsWith(`${ADR_DIR}/`) && file !== `${ADR_DIR}/README.md`,
    );
    const errors: string[] = [];
    const valid: string[] = [];
    for (const file of files) {
      const name = file.slice(ADR_DIR.length + 1);
      if (/^\d{4}-[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(name)) valid.push(file);
      else {
        errors.push(
          `${file} 的文件名不合规则。决策记录的文件名是 NNNN-kebab-case.md（四位编号、小写英文和连字符），见 ${GUIDE}。`,
        );
      }
    }
    const numbers = valid.map((file) => Number(file.slice(ADR_DIR.length + 1, ADR_DIR.length + 5)));
    numbers.forEach((number, index) => {
      if (number !== index + 1) {
        errors.push(
          `决策记录的编号不连续或有重复：第 ${index + 1} 份是 ${valid[index]}，应该以 ${pad(index + 1)} 开头。编号从 0001 起逐个加一，不跳号、不复用。`,
        );
      }
    });
    const known = new Set(numbers);
    for (const file of valid) errors.push(...checkAdrFile(file, readText(root, file), known));
    return errors.map((error) => (error.includes(GUIDE) ? error : `${error} 写法见 ${GUIDE}。`));
  },
};
