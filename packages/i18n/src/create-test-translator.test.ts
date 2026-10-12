import { describe, expect, it } from "vitest";
import { createTestTranslator } from "./create-test-translator.ts";

describe("createTestTranslator", () => {
  it("没有参数时返回用 ⟦ ⟧ 括起来的键", () => {
    expect(createTestTranslator().t("format.relative.justNow")).toBe("⟦format.relative.justNow⟧");
  });

  it("带参数时返回键加按名字排序的参数，断言不依赖真实文字", () => {
    const { t } = createTestTranslator();
    expect(t("errors.NAME_EXISTS.title", { name: "demo" })).toBe(
      "⟦errors.NAME_EXISTS.title|name=demo⟧",
    );
    expect(t("notice.PORT_FALLBACK", { wanted: 3000, actual: 3001, reason: "PORT_OCCUPIED" })).toBe(
      "⟦notice.PORT_FALLBACK|actual=3001,reason=PORT_OCCUPIED,wanted=3000⟧",
    );
  });
});
