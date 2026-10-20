import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildVueLanguageService,
  VUE_LANGUAGE_SERVICE_PATHS,
  vueLanguageServiceProblems,
} from "./vue-language-service.ts";

// 真的用 esbuild 和文件复制生成一份语言服务目录，核对结构（决策记录 0021、证据“踩到的坑”第 4 至 6 条）
describe("buildVueLanguageService", () => {
  it("生成的目录通过自检，且语言服务器是单文件、插件是原样复制", async () => {
    const out = mkdtempSync(join(tmpdir(), "ry-vue-service-"));
    const root = await buildVueLanguageService(join(import.meta.dirname, ".."), out);

    expect(vueLanguageServiceProblems(root)).toEqual([]);
    const fallback = join(root, "fallback-types");
    const declarations = JSON.parse(readFileSync(join(fallback, "manifest.json"), "utf8")) as {
      name: string;
      version: string;
      license: string;
    }[];
    expect(declarations.find((item) => item.name === "vue")?.version).toBe("3.5.43");
    for (const item of declarations) {
      expect(["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause"]).toContain(item.license);
      expect(
        readdirSync(join(fallback, "node_modules", item.name)).some((name) =>
          /^(license|licence|copying)([.-].*)?$/i.test(name),
        ),
        item.name,
      ).toBe(true);
    }
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    expect(walk(fallback).filter((path) => /\.(mjs|cjs|js)$/.test(path))).toEqual([]);

    // 类型文件在打包文件的上一级（坑 5）
    expect(existsSync(join(root, "types", "template-helpers.d.ts"))).toBe(true);
    // 服务器不依赖 node_modules 里的 vscode-json-languageservice（mainFields 为 module,main，坑 4）
    const bundle = readFileSync(join(root, VUE_LANGUAGE_SERVICE_PATHS.server), "utf8");
    expect(bundle).not.toContain('./services/jsonCompletion"');
    // 插件没有被打成单文件，依赖在旁边（坑 6）
    expect(existsSync(join(root, "node_modules", "@vue", "language-core", "index.js"))).toBe(true);
    // 去掉了 .map、.md 和多余的 .d.ts
    expect(existsSync(join(root, "node_modules", "@vue", "typescript-plugin", "index.d.ts"))).toBe(
      false,
    );
    expect(existsSync(join(root, "node_modules", "@vue", "typescript-plugin", "README.md"))).toBe(
      false,
    );
    // 只带 tsserver 要的 TypeScript，体积在预期内（证据约 23 MB，留余量）
    expect(existsSync(join(root, "typescript", "lib", "_tsc.js"))).toBe(false);
    expect(statSync(join(root, VUE_LANGUAGE_SERVICE_PATHS.server)).size).toBeLessThan(8_000_000);
  }, 60_000);
});
