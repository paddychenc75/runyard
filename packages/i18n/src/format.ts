import type { Translator } from "./create-translator.ts";
import { type Localized, markLocalized } from "./localized.ts";

// 数字、大小、时长、相对时间的统一出口（技术设计 §6.8“日期、数字、大小、时长”）。
// 功能模块不直接调 Intl，也不自己拼单位。相对时间和说给人听的时长用我们自己的文案（format 组），
// 因为 Intl.RelativeTimeFormat 的中英文写法和设计稿对不上。

export interface Format {
  /** 整数、小数：Intl.NumberFormat，随语言加千分位 */
  number(value: number): Localized;
  /** 文件大小：数字加不翻译的 B / KB / MB / GB / TB，中间一个空格，1024 进制，最多一位小数 */
  fileSize(bytes: number): Localized;
  /** 技术性时长：不翻译的 ms / s（如 1180 ms、1.2 s） */
  technicalDuration(ms: number): Localized;
  /** 说给人听的时长：秒 / 分钟 / 小时 / 天，取四舍五入后合适的单位 */
  humanDuration(ms: number): Localized;
  /** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前。now 由调用方传入，函数本身不读时钟 */
  relativeTime(thenMs: number, nowMs: number): Localized;
}

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

// 这些 RangeError 是写给开发者的诊断（调用方传了坏数字），用英文，不显示给用户：
// 字符串里写汉字会被 ui-strings 当成写死的界面文字（技术设计 §6.8 第 4 层）
function assertFinite(value: number, what: string): void {
  if (!Number.isFinite(value))
    throw new RangeError(`${what} must be a finite number, got ${value}`);
}

export function createFormat(translator: Translator): Format {
  const { locale, t } = translator;
  const numbers = (maximumFractionDigits: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits });
  const integer = numbers(0);
  const oneDecimal = numbers(1);

  return {
    number: (value) => markLocalized(numbers(20).format(value)),

    fileSize(bytes) {
      assertFinite(bytes, "file size");
      if (bytes < 0) throw new RangeError(`file size must not be negative, got ${bytes}`);
      let unit = 0;
      let value = bytes;
      // 进位按“四舍五入到一位小数之后”判断，避免出现 1,024 KB
      while (unit < SIZE_UNITS.length - 1 && Math.round(value * 10) / 10 >= 1024) {
        value /= 1024;
        unit += 1;
      }
      const text = (unit === 0 ? integer : oneDecimal).format(value);
      return markLocalized(`${text} ${SIZE_UNITS[unit]}`);
    },

    technicalDuration(ms) {
      assertFinite(ms, "duration");
      if (ms < 0) throw new RangeError(`duration must not be negative, got ${ms}`);
      if (Math.round(ms) < 1000) return markLocalized(`${integer.format(ms)} ms`);
      return markLocalized(`${oneDecimal.format(ms / 1000)} s`);
    },

    humanDuration(ms) {
      assertFinite(ms, "duration");
      if (ms < 0) throw new RangeError(`duration must not be negative, got ${ms}`);
      const seconds = Math.round(ms / 1000);
      if (seconds < 60) return t("format.duration.seconds", { count: seconds });
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return t("format.duration.minutes", { count: minutes });
      const hours = Math.round(minutes / 60);
      if (hours < 24) return t("format.duration.hours", { count: hours });
      return t("format.duration.days", { count: Math.round(hours / 24) });
    },

    relativeTime(thenMs, nowMs) {
      assertFinite(thenMs, "time");
      assertFinite(nowMs, "current time");
      // 时钟偏差让“过去”出现在未来时，按“刚刚”处理，不显示负数
      const diff = Math.max(0, nowMs - thenMs);
      const minutes = Math.floor(diff / 60_000);
      if (minutes < 1) return t("format.relative.justNow");
      if (minutes < 60) return t("format.relative.minutes", { count: minutes });
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return t("format.relative.hours", { count: hours });
      return t("format.relative.days", { count: Math.floor(hours / 24) });
    },
  };
}
