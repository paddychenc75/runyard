import { describe, expect, it } from "vitest";
import { type Catalog, createTranslator } from "./create-translator.ts";
import { PSEUDO_CLOSE, PSEUDO_OPEN, pseudolocalize } from "./pseudo.ts";

const inner = (text: string) => text.slice(PSEUDO_OPEN.length, -PSEUDO_CLOSE.length);

describe("pseudolocalize", () => {
  it("字母换成带重音的字母，首尾加 ⟦ ⟧，其余字符不动", () => {
    const out = pseudolocalize("Run");
    expect(out.startsWith(PSEUDO_OPEN)).toBe(true);
    expect(out.endsWith(PSEUDO_CLOSE)).toBe(true);
    expect(out).toContain("Ŕúñ");
    expect(pseudolocalize("1, 2!")).toContain("1, 2!");
  });

  it("末尾补字符，长度比原文长约 40%", () => {
    const source = "Create a new playground from a template";
    const out = pseudolocalize(source);
    const letters = source.replace(/[^A-Za-z]/g, "").length;
    expect(inner(out).length).toBe(source.length + Math.ceil(letters * 0.4));
  });

  it("参数名、类型和选择词原样，只有分支里的文字变", () => {
    const out = pseudolocalize(
      "{count, plural, one {# playground} other {# playgrounds}} of {name}",
    );
    expect(out).toContain("{count, plural, one {# þļáýĝŕóúñð} other {# þļáýĝŕóúñðš}}");
    expect(out).toContain("{name}");
    expect(pseudolocalize("{n, number}")).toContain("{n, number}");
    expect(pseudolocalize("{exitCode, select, none {} other {, exit {exitCode}}}")).toContain(
      "{exitCode, select, none {} other {, éẋíţ {exitCode}}}",
    );
  });

  it("富文本标签原样，标签里的文字变", () => {
    expect(pseudolocalize("Run <b>{name}</b> now")).toContain("<b>{name}</b>");
    expect(pseudolocalize("<code>ls</code>")).toContain("<code>ļš</code>");
  });

  it("引号转义的大括号原样", () => {
    expect(pseudolocalize("Use '{'braces'}'")).toContain("'{'");
  });

  it("变出来的文案仍是合法 ICU（能被格式化）", () => {
    const catalog: Catalog = {
      en: { "demo.n": "{count, plural, one {# item} other {# items}} in <b>{name}</b>" },
      "zh-CN": {},
    };
    const { t } = createTranslator({
      locale: "en-XA",
      platform: "darwin",
      catalogs: [catalog],
    });
    // @ts-expect-error 夹具键不在生成的类型里
    expect(t("demo.n", { count: 2, name: "x", b: (c: string[]) => c.join("") })).toContain(
      "2 íţéɱš",
    );
  });
});
