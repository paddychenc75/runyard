import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { vueLanguageServiceProblems } from "./vue-language-service.ts";

describe("vueLanguageServiceProblems", () => {
  it("空目录逐项报出缺少的文件", () => {
    // 临时目录不删，留给系统清理
    const root = mkdtempSync(join(tmpdir(), "ry-vue-service-"));
    const problems = vueLanguageServiceProblems(root);
    expect(problems).toContain("语言服务目录缺少 server/vue-language-server.cjs");
    expect(problems.some((problem) => problem.includes("tsserver.js"))).toBe(true);
    expect(problems.some((problem) => problem.includes("manifest.json"))).toBe(true);
  });

  it("两个 Vue 包的版本不同时报错", () => {
    const root = mkdtempSync(join(tmpdir(), "ry-vue-service-"));
    writeFileSync(
      join(root, "manifest.json"),
      JSON.stringify({
        vueLanguageServer: "3.3.12",
        vueTypescriptPlugin: "3.3.11",
        typescript: "6.0.3",
      }),
    );
    expect(vueLanguageServiceProblems(root).join("\n")).toContain("版本不同");
  });
});
