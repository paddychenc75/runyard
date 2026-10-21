import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Catalog } from "../create-translator.ts";
import { desktopCatalogs } from "../desktop-catalogs.ts";
import type { Locale, PlatformId } from "../locale.ts";
import { pseudoLocale } from "../pseudo.ts";
import { htmlLang, I18nProvider, T, useFormat, useLocale, useT } from "./index.ts";

const fixture: Catalog = {
  en: {
    "demo.rich": "Folder <code>{path}</code> is ready, <b>go</b>",
    "demo.plain": "Hello {name}",
  },
  "zh-CN": {
    "demo.rich": "文件夹 <code>{path}</code> 已就绪，<b>开始</b>",
    "demo.plain": "你好 {name}",
  },
};
const catalogs = [...desktopCatalogs, fixture];

// 夹具键不在生成的类型里，测试里把 <T> 当宽松组件用；真正的类型约束见 types.test.ts
const LooseT = T as unknown as (props: {
  k: string;
  values?: object;
  components?: object;
}) => ReactNode;

function render(
  locale: Locale | typeof pseudoLocale,
  child: ReactNode,
  platform: PlatformId = "darwin",
): string {
  return renderToStaticMarkup(createElement(I18nProvider, { locale, platform, catalogs }, child));
}

describe("I18nProvider 和钩子", () => {
  const Title = () => createElement("h1", null, useT()("library.nav.library.title"));

  it("useT 按 Provider 的语言取文案；语言一换就是另一句", () => {
    expect(render("zh-CN", createElement(Title))).toBe("<h1>资源库</h1>");
    expect(render("en", createElement(Title))).toBe("<h1>Library</h1>");
  });

  it("没包 Provider 就用钩子，抛开发者诊断", () => {
    expect(() => renderToStaticMarkup(createElement(Title))).toThrow(
      "useTranslator must be used inside <I18nProvider>",
    );
  });

  it("useLocale 给实际语言，htmlLang 给 <html lang>", () => {
    const Show = () => createElement("i", null, useLocale());
    expect(render("zh-CN", createElement(Show))).toBe("<i>zh-CN</i>");
    expect(render(pseudoLocale, createElement(Show))).toBe("<i>en</i>");
    expect(htmlLang("zh-CN")).toBe("zh-CN");
    expect(htmlLang("en")).toBe("en");
  });

  it("useFormat 随语言格式化数字、大小、时长", () => {
    const Show = () => {
      const fmt = useFormat();
      return createElement(
        "p",
        null,
        `${fmt.number(1234.5)}|${fmt.fileSize(2048)}|${fmt.humanDuration(120_000)}`,
      );
    };
    expect(render("en", createElement(Show))).toBe("<p>1,234.5|2 KB|2 min</p>");
    expect(render("zh-CN", createElement(Show))).toBe("<p>1,234.5|2 KB|2 分钟</p>");
  });

  it("伪语言下整句在 ⟦ ⟧ 里", () => {
    expect(render(pseudoLocale, createElement(Title))).toMatch(/^<h1>⟦.+⟧<\/h1>$/);
  });
});

describe("<T> 带标签的文案", () => {
  const rich = createElement(LooseT, {
    k: "demo.rich",
    values: { path: "/tmp/a" },
    components: { code: createElement("code", { className: "c" }), b: createElement("strong") },
  });

  it("标签换成调用方给的组件，内容成为它的子节点，中英文都对", () => {
    expect(render("en", rich)).toBe(
      'Folder <code class="c">/tmp/a</code> is ready, <strong>go</strong>',
    );
    expect(render("zh-CN", rich)).toBe(
      '文件夹 <code class="c">/tmp/a</code> 已就绪，<strong>开始</strong>',
    );
  });

  it("没有标签的文案也能用，参数照填", () => {
    expect(render("en", createElement(LooseT, { k: "demo.plain", values: { name: "Ada" } }))).toBe(
      "Hello Ada",
    );
  });

  it("伪语言下标签和参数都保留", () => {
    const html = render(pseudoLocale, rich);
    expect(html).toContain('<code class="c">/tmp/a</code>');
    expect(html.startsWith("⟦")).toBe(true);
    expect(html.endsWith("⟧")).toBe(true);
  });
});
