// 语言列表的唯一来源（技术设计 §6.8）：设置页的选项、语言解析、检查都从这里读。
// 加第三种语言先在这里加，再补文案目录。
export const locales = ["en", "zh-CN"] as const;
export type Locale = (typeof locales)[number];

// 中文是源语言（文案先写中文），英文是运行时缺键时的回退
export const sourceLocale: Locale = "zh-CN";
export const fallbackLocale: Locale = "en";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

// 系统用词（废纸篓 / 回收站等）按系统选；第一版只填 darwin 一支，其余落到 select 的 other
export type PlatformId = "darwin" | "linux" | "win32";
