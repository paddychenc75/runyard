import { join } from "node:path";
import type * as TypeScript from "typescript";

/** 仅为未解析到 Vue 的导入提供固定随包声明；先完整委托项目原有解析器。 */
export function createVueTypesFallback(modules: { typescript: typeof TypeScript }) {
  const ts = modules.typescript;
  const base = join(__dirname, "..", "..", "..", "fallback-types", "node_modules", "vue");
  const entries = new Map([
    ["vue", join(base, "dist", "vue.d.ts")],
    ["vue/jsx-runtime", join(base, "jsx-runtime", "index.d.ts")],
    ["vue/jsx-dev-runtime", join(base, "jsx-runtime", "index.d.ts")],
  ]);
  const fallback = (name: string): TypeScript.ResolvedModuleFull | undefined => {
    const file = entries.get(name);
    return file && ts.sys.fileExists(file)
      ? { resolvedFileName: file, extension: ts.Extension.Dts, isExternalLibraryImport: true }
      : undefined;
  };
  return {
    create(info: TypeScript.server.PluginCreateInfo) {
      const host = info.languageServiceHost;
      const literals = host.resolveModuleNameLiterals;
      const names = host.resolveModuleNames;
      if (literals) {
        host.resolveModuleNameLiterals = (...args) => {
          const found = literals.apply(host, args);
          return found.map((item, index) =>
            item.resolvedModule
              ? item
              : {
                  ...item,
                  resolvedModule: fallback(args[0][index]?.text ?? ""),
                },
          );
        };
      }
      if (names) {
        host.resolveModuleNames = (...args) => {
          const found = names.apply(host, args);
          return found.map((item, index) => item ?? fallback(args[0][index] ?? ""));
        };
      }
      return info.languageService;
    },
  };
}
