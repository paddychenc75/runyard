/** 写成 TS 字符串字面量。和 Biome 一样：内含双引号又没有单引号时改用单引号，少写转义 */
export function quote(text: string): string {
  if (text.includes('"') && !text.includes("'")) return `'${text}'`;
  return JSON.stringify(text);
}
