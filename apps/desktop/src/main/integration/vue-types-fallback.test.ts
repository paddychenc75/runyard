import type * as TS from "typescript";
import { expect, it, vi } from "vitest";
import { createVueTypesFallback } from "./vue-types-fallback.ts";

it("原解析成功始终优先，只有三个固定Vue入口兜底，原型名也不放行", () => {
  const project = {
    resolvedFileName: "/project/node_modules/vue/real-project-version.d.ts",
    extension: ".d.ts",
    isExternalLibraryImport: true,
  };
  const originals = [
    { resolvedModule: project },
    { resolvedModule: undefined },
    { resolvedModule: undefined },
    { resolvedModule: undefined },
  ];
  const host = { resolveModuleNameLiterals: vi.fn(() => originals) };
  const fileExists = vi.fn(() => true);
  const plugin = createVueTypesFallback({
    typescript: { sys: { fileExists }, Extension: { Dts: ".d.ts" } } as unknown as typeof TS,
  });
  const service = {};
  plugin.create({
    languageServiceHost: host,
    languageService: service,
  } as unknown as TS.server.PluginCreateInfo);
  const result = (
    host.resolveModuleNameLiterals as unknown as (
      names: { text: string }[],
    ) => TS.ResolvedModuleWithFailedLookupLocations[]
  )([{ text: "vue" }, { text: "vue/jsx-runtime" }, { text: "unrelated" }, { text: "constructor" }]);
  expect(result[0]).toBe(originals[0]);
  expect(result[1]?.resolvedModule?.resolvedFileName).toMatch(/jsx-runtime[/\\]index\.d\.ts$/);
  expect(result[2]?.resolvedModule).toBeUndefined();
  expect(result[3]?.resolvedModule).toBeUndefined();
  expect(fileExists).toHaveBeenCalledTimes(1);
});

it("原解析器抛错保持抛错，不把权限错误伪装成兜底成功", () => {
  const original = new Error("original resolver failed");
  const host = {
    resolveModuleNameLiterals: vi.fn(() => {
      throw original;
    }),
  };
  const fileExists = vi.fn(() => true);
  const plugin = createVueTypesFallback({
    typescript: { sys: { fileExists }, Extension: { Dts: ".d.ts" } } as unknown as typeof TS,
  });
  plugin.create({
    languageServiceHost: host,
    languageService: {},
  } as unknown as TS.server.PluginCreateInfo);
  expect(() =>
    (host.resolveModuleNameLiterals as unknown as (names: { text: string }[]) => unknown)([
      { text: "vue" },
    ]),
  ).toThrow(original);
  expect(fileExists).not.toHaveBeenCalled();
});
