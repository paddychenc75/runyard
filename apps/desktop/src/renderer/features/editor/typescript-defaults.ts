import type { EditorRuntime } from "../../editor/runtime-types.ts";

// 编辑器的 TypeScript、JavaScript 语言服务的全局设置（从 monaco-host.ts 拆出来，规格 DESKTOP-EDITOR-43、44）。

/**
 * 项目里没法解析依赖包的类型，“找不到模块”和它的连带误报屏蔽掉（K8 证据“装法”第 6 条；规格 DESKTOP-EDITOR-43）。
 * 前五个是 K8 实测的；后三个（7006、7031、7044：参数隐式 any）是拿真实的 react19 模板过一遍时发现的：
 * `setCount((value) => value + 1)` 因为没有 react 的类型，value 推不出来，开箱就红一条。
 */
export const IGNORED_DIAGNOSTIC_CODES = [2307, 2792, 7016, 7026, 2875, 7006, 7031, 7044];

const configured = new WeakSet<object>();

export function configureTypeScript(runtime: EditorRuntime): void {
  if (configured.has(runtime)) return;
  configured.add(runtime);
  const { typescript } = runtime;
  const { typescriptDefaults, javascriptDefaults } = typescript;
  const compilerOptions = {
    allowNonTsExtensions: true,
    allowJs: true,
    noEmit: true,
    target: typescript.ScriptTarget.ESNext,
    module: typescript.ModuleKind.ESNext,
    jsx: typescript.JsxEmit.ReactJSX,
    moduleResolution: typescript.ModuleResolutionKind.NodeJs,
  };
  typescriptDefaults.setCompilerOptions(compilerOptions);
  javascriptDefaults.setCompilerOptions(compilerOptions);
  // 语义检查（类型错误）由 TypeScriptDiagnostics 自己做：Monaco 自带的只在本文件内容变了时重做，
  // 别的文件改了不会更新（DESKTOP-EDITOR-44）。语法检查仍用自带的。
  const diagnostics = {
    diagnosticCodesToIgnore: IGNORED_DIAGNOSTIC_CODES,
    noSemanticValidation: true,
  };
  typescriptDefaults.setDiagnosticsOptions(diagnostics);
  javascriptDefaults.setDiagnosticsOptions(diagnostics);
}
