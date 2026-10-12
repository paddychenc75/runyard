import { describe, expect, it } from "vitest";
import { createTestTranslator } from "./create-test-translator.ts";
import type { Localized } from "./localized.ts";

// 类型测试：这个文件本身要通过 tsc -b。每个 @ts-expect-error 都对应一种“写错了就该报错”的情形（issue #21）；
// 如果类型变松，指令就“用不上”，tsc 会报错。运行时只做最简单的断言。
describe("键和参数的类型", () => {
  const { t } = createTestTranslator();

  it("正确的键和参数通过，结果是 Localized", () => {
    const text: Localized = t("format.relative.minutes", { count: 3 });
    expect(text).toBe("⟦format.relative.minutes|count=3⟧");
    expect(t("format.relative.justNow")).toBe("⟦format.relative.justNow⟧");
  });

  it("写错键是类型错误", () => {
    // @ts-expect-error 键拼错，类型测试（issue #21）
    t("format.relative.minuts", { count: 3 });
  });

  it("漏传参数是类型错误", () => {
    // @ts-expect-error 有参数的键不传参数，类型测试（issue #21）
    t("format.relative.minutes");
    // @ts-expect-error 少传一个必填参数，类型测试（issue #21）
    t("notice.PORT_FALLBACK", { wanted: 1, actual: 2 });
  });

  it("多传或传错类型的参数是类型错误", () => {
    // @ts-expect-error 参数类型应是 number，类型测试（issue #21）
    t("format.relative.minutes", { count: "3" });
    // @ts-expect-error 没有参数的键不接受参数，类型测试（issue #21）
    t("format.relative.justNow", { count: 1 });
  });

  it("错误码、提示码、运行状态的键由 protocol 登记表推出", () => {
    t("errors.NAME_EXISTS.title", { name: "demo" });
    t("errors.APP_REQUIRED.hintCli");
    t("notice.PORT_FALLBACK", { wanted: 1, actual: 2, reason: "PORT_OCCUPIED" });
    t("runState.ready");
    // @ts-expect-error 登记表里没有这个错误码，类型测试（issue #21）
    t("errors.NO_SUCH_CODE.title");
    // @ts-expect-error 参数名要和登记表一致，类型测试（issue #21）
    t("errors.NAME_EXISTS.title", { nam: "demo" });
    // @ts-expect-error 没有这个运行状态，类型测试（issue #21）
    t("runState.flying");
    expect(true).toBe(true);
  });

  it("普通字符串不能当 Localized 用", () => {
    // @ts-expect-error 只有翻译函数能产出 Localized，类型测试（issue #21）
    const text: Localized = "还没有项目";
    expect(text).toBeTypeOf("string");
  });
});
