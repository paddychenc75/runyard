import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { errorCodes, errorRegistry, noticeCodes, noticeRegistry } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { paramTypesOf } from "./icu-params.ts";

// 临时断言（完整的 i18n-codes 检查是 issue #23）：文案用到的参数和登记表一致。
// 编译期守着的是 t() 调用处的键和参数（src/messages.ts 由登记表推出）；
// 文案文本里的参数名只有解析了 ICU 才知道，所以在这里运行时核对。
// 要核对的三条：① 文案不用登记表没有的参数；② 登记表里必填的参数至少出现在同一个代码的某个字段里
// （标题不必带全部参数，四个字段合起来要带全）；③ 中英文用的参数名一致。

const localesDir = join(import.meta.dirname, "..", "locales");
const load = (locale: string): Record<string, string> => {
  const merged: Record<string, string> = {};
  const dir = join(localesDir, locale);
  for (const file of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    Object.assign(merged, JSON.parse(readFileSync(join(dir, file), "utf8")));
  }
  return merged;
};
const catalogs = { "zh-CN": load("zh-CN"), en: load("en") };
type Shape = Record<string, { isOptional(): boolean }>;
const shapeOf = (params: unknown): Shape => (params as { shape: Shape }).shape;
const paramNames = (message: string): string[] => [...paramTypesOf(message).keys()].sort();

describe("文案的参数和登记表一致", () => {
  for (const locale of ["zh-CN", "en"] as const) {
    const catalog = catalogs[locale];

    it(`[${locale}] 错误码：不用登记表没有的参数，必填参数在四个字段里都出现过`, () => {
      for (const code of errorCodes) {
        const shape = shapeOf(errorRegistry[code].params);
        const used = new Set<string>();
        for (const field of ["title", "body", "hint", "hintCli"]) {
          const key = `errors.${code}.${field}`;
          for (const name of paramNames(catalog[key] ?? "")) {
            expect(Object.keys(shape), `${key} 用了登记表没有的参数 ${name}`).toContain(name);
            used.add(name);
          }
        }
        for (const [name, field] of Object.entries(shape)) {
          if (!field.isOptional())
            expect([...used], `errors.${code} 没有用到必填参数 ${name}`).toContain(name);
        }
      }
    });

    it(`[${locale}] 提示码：不用登记表没有的参数，必填参数都用到`, () => {
      for (const code of noticeCodes) {
        const shape = shapeOf(noticeRegistry[code].params);
        const used = paramNames(catalog[`notice.${code}`] ?? "");
        for (const name of used)
          expect(Object.keys(shape), `notice.${code} 用了登记表没有的参数 ${name}`).toContain(name);
        for (const [name, field] of Object.entries(shape)) {
          if (!field.isOptional())
            expect(used, `notice.${code} 没有用到必填参数 ${name}`).toContain(name);
        }
      }
    });

    it(`[${locale}] 运行状态的文案没有参数`, () => {
      for (const [key, message] of Object.entries(catalog)) {
        if (key.startsWith("runState.")) expect(paramNames(message), key).toEqual([]);
      }
    });
  }

  it("同一个键中英文用的参数名一致（复数和选择的分支结构可以不同）", () => {
    for (const key of Object.keys(catalogs["zh-CN"])) {
      const zh = catalogs["zh-CN"][key] ?? "";
      const en = catalogs.en[key] ?? "";
      expect(paramNames(en), key).toEqual(paramNames(zh));
    }
    expect(Object.keys(catalogs.en).sort()).toEqual(Object.keys(catalogs["zh-CN"]).sort());
  });

  it("带参数的文案都有备注：每个参数一条说明", () => {
    const notes: Record<string, Record<string, string>> = {};
    for (const file of readdirSync(join(localesDir, "notes"))) {
      Object.assign(notes, JSON.parse(readFileSync(join(localesDir, "notes", file), "utf8")));
    }
    for (const [key, message] of Object.entries(catalogs["zh-CN"])) {
      for (const name of paramNames(message)) {
        expect(notes[key]?.[name], `${key} 缺参数 ${name} 的备注`).toBeTypeOf("string");
      }
    }
  });
});
