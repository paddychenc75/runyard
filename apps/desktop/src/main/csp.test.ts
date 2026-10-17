import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 界面的内容安全策略（决策记录 0020）：脚本严格，样式放宽到 'unsafe-inline'，只多一个 font-src。
// 这些断言守住“不多放开别的”和“有哈希时 unsafe-inline 失效”这两个容易改坏的点。

function policy(): Map<string, string[]> {
  const html = readFileSync(
    fileURLToPath(new URL("../renderer/index.html", import.meta.url)),
    "utf8",
  );
  const content = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
  if (content === undefined) throw new Error("no CSP meta in index.html");
  const directives = new Map<string, string[]>();
  for (const part of content.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name !== undefined && name !== "") directives.set(name, values);
  }
  return directives;
}

describe("index.html 的内容安全策略", () => {
  it("只有预期的几条指令，取值正是决策记录 0020 写的", () => {
    expect(Object.fromEntries(policy())).toEqual({
      "default-src": ["'none'"],
      "script-src": ["app://runyard"],
      "img-src": ["data:"],
      "font-src": ["app://runyard"],
      "style-src": ["app://runyard", "'unsafe-inline'"],
    });
  });

  it("style-src 里没有哈希或随机数：有了它们浏览器就忽略 'unsafe-inline'", () => {
    const style = policy().get("style-src") ?? [];
    expect(style.filter((value) => /^'(sha\d+|nonce)-/.test(value))).toEqual([]);
  });

  it("脚本不放开 unsafe-eval、wasm、blob，也没有 worker-src 和 connect-src", () => {
    const rules = policy();
    expect(rules.get("script-src")).toEqual(["app://runyard"]);
    expect(rules.has("worker-src")).toBe(false);
    expect(rules.has("connect-src")).toBe(false);
  });
});
