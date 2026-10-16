// 颜色写法转换。Monaco、xterm 一类的库要的是真实色值（#RRGGBB 或 #RRGGBBAA），不认 rgba() 和 CSS 变量。

const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

/** #RRGGBB 原样（大写）；rgba(r, g, b, a) 转成 #RRGGBBAA；alpha 为 1 时省略 AA */
export function toHex(color: string): string {
  if (color.startsWith("#")) return color.toUpperCase();
  const match = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(color);
  if (match === null) throw new Error(`不认识的颜色写法：${color}`);
  const [r, g, b] = [match[1], match[2], match[3]].map(Number) as [number, number, number];
  const alpha = Math.round(Number(match[4]) * 255);
  return `#${hex(r)}${hex(g)}${hex(b)}${alpha === 255 ? "" : hex(alpha)}`;
}
