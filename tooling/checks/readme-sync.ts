import { listFiles, proseLines, readText } from "./docs.ts";
import type { Check } from "./workspace.ts";

// readme-sync：README.md（英文）和 README.zh-CN.md（中文）结构一致（技术设计 §8.4、§9.4）。
// 两个文件里每个二级、三级标题的上一行都要有一个稳定标记，如 <!-- sec: install -->；
// 检查比较两边的标记序列是否完全一样（不比标题文字和正文），并检查开头几行互相链接。
// 它只能保证结构一致，内容是否同步要人确认。

const EN = "README.md";
const ZH = "README.zh-CN.md";
const MARKER = /^<!--\s*sec:\s*([a-z0-9-]+)\s*-->$/;

// 返回标记序列，以及“标题上一行没有标记”的错误
export function sectionMarkers(file: string, text: string): { ids: string[]; errors: string[] } {
  const ids: string[] = [];
  const errors: string[] = [];
  const lines = proseLines(text);
  lines.forEach((line, index) => {
    if (!/^#{2,3}\s/.test(line)) return;
    const marker = MARKER.exec((lines[index - 1] ?? "").trim());
    if (marker === null) {
      errors.push(
        `${file}:${index + 1} 的标题“${line.trim()}”上一行没有章节标记。在它上面单独一行写 <!-- sec: 英文短名 -->，另一个 README 的对应标题用同一个短名。`,
      );
      return;
    }
    ids.push(marker[1] as string);
  });
  return { ids, errors };
}

export const readmeSync: Check = {
  name: "readme-sync",
  run(root) {
    const files = listFiles(root);
    const missing = [EN, ZH].filter((file) => !files.includes(file));
    if (missing.length > 0) {
      return [`缺少 ${missing.join("、")}。README 必须有英文和中文两个版本（技术设计 §8.4）。`];
    }
    const en = readText(root, EN);
    const zh = readText(root, ZH);
    const errors: string[] = [];
    const head = (text: string) => text.split("\n").slice(0, 8).join("\n");
    if (!head(en).includes(`(${ZH})`)) {
      errors.push(`${EN} 开头缺少指向 ${ZH} 的链接。在标题下面加一行 [简体中文](${ZH})。`);
    }
    if (!head(zh).includes(`(${EN})`)) {
      errors.push(`${ZH} 开头缺少指向 ${EN} 的链接。在标题下面加一行 [English](${EN})。`);
    }
    const enMarkers = sectionMarkers(EN, en);
    const zhMarkers = sectionMarkers(ZH, zh);
    errors.push(...enMarkers.errors, ...zhMarkers.errors);
    for (const [file, ids] of [
      [EN, enMarkers.ids],
      [ZH, zhMarkers.ids],
    ] as const) {
      for (const id of new Set(ids.filter((value, i) => ids.indexOf(value) !== i))) {
        errors.push(`${file} 里章节标记 ${id} 出现了不止一次。每个标记只能用一次。`);
      }
    }
    if (errors.length === 0 && enMarkers.ids.join("|") !== zhMarkers.ids.join("|")) {
      errors.push(
        `${EN} 和 ${ZH} 的章节不一致。${EN}：${enMarkers.ids.join("、")}；${ZH}：${zhMarkers.ids.join("、")}。加、删、挪动章节时两个文件要一起改，顺序也要一样。`,
      );
    }
    return errors;
  },
};
