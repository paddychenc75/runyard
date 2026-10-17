import { createTypeScriptWorkerLanguageService } from "@volar/monaco/worker";
import { createVueLanguagePlugin, getDefaultCompilerOptions, forEachElementNode } from "@vue/language-core";
import { createVueLanguageServicePlugins } from "@vue/language-service";
import { getComponentNames } from "@vue/typescript-plugin/lib/requests/getComponentNames";
import { getComponentProps } from "@vue/typescript-plugin/lib/requests/getComponentProps";
import { getElementAttrs } from "@vue/typescript-plugin/lib/requests/getElementAttrs";
import { create as createTypeScriptServicePlugin } from "volar-service-typescript";
import * as ts from "typescript";
import { URI } from "vscode-uri";
import fsdata from "./fsdata.json";

const files = fsdata as Record<string, string>;
const dirs = new Set<string>();
for (const p of Object.keys(files)) { let d = p; while ((d = d.slice(0, d.lastIndexOf("/"))) !== "") dirs.add(d); }
dirs.add("/");

export function createVueWorkerService(workerContext: any, log: (s: string) => void = () => {}) {
  const compilerOptions: ts.CompilerOptions = {
    allowNonTsExtensions: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.Preserve, strict: true, noEmit: true,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"], skipLibCheck: true, types: [],
  };
  const vueCompilerOptions = getDefaultCompilerOptions(3.5, "vue", true);
  const env = {
    workspaceFolders: [URI.file("/proj")],
    fs: {
      stat(uri: URI) {
        const p = uri.path;
        if (files[p] !== undefined) return { type: 1, ctime: 0, mtime: 0, size: files[p].length };
        if (dirs.has(p)) return { type: 2, ctime: 0, mtime: 0, size: 0 };
        return undefined;
      },
      readFile(uri: URI) { return files[uri.path]; },
      readDirectory(uri: URI) {
        const base = uri.path.replace(/\/$/, "") + "/";
        const out = new Map<string, number>();
        for (const p of Object.keys(files)) if (p.startsWith(base)) { const rest = p.slice(base.length); const i = rest.indexOf("/"); out.set(i < 0 ? rest : rest.slice(0, i), i < 0 ? 1 : 2); }
        return [...out];
      },
    },
  };
  const uriConverter = { asFileName: (u: URI) => u.fsPath, asUri: (f: string) => URI.file(f) };
  const vueLang = createVueLanguagePlugin<URI>(ts, compilerOptions, vueCompilerOptions as any, (u) => u.fsPath);

  // 把 Vue 官方 typescript-plugin 里的“请求”接到同一个语言服务上（单独的 worker 里没有 tsserver）
  let tsLs: ts.LanguageService; let language: any; let projectRef: any;
  const withVirtual = (fileName: string) => {
    const sourceScript = language.scripts.get(URI.file(fileName));
    const virtualCode = sourceScript?.generated?.root;
    return { sourceScript, virtualCode, program: tsLs.getProgram()! };
  };
  const impl: any = {
    getComponentNames: (fileName: string) => { const { virtualCode, program } = withVirtual(fileName); return virtualCode && getComponentNames(ts, program, virtualCode); },
    getElementAttrs: (fileName: string, tag: string) => { const { program } = withVirtual(fileName); return getElementAttrs(ts, program, fileName, tag); },
    getComponentProps: (fileName: string, position: number) => { const { sourceScript, virtualCode, program } = withVirtual(fileName); return virtualCode && getComponentProps(ts, tsLs, program, language, sourceScript, virtualCode, position); },
    getComponentDirectives: () => [], getComponentSlots: () => [], getElementNames: () => [], getComponentMeta: () => undefined,
  };
  const client: any = new Proxy(impl, { get: (t, k) => (k in t ? t[k] : () => undefined) });
  // pug 与 emmet 的服务在浏览器环境是空壳（“not yet supported for web”），jade 模板插件会因此崩溃，去掉
  const plugins = createVueLanguageServicePlugins(ts as any, client).filter((p: any) => !/jade|pug|emmet/i.test(p.name ?? ""));
  const svc: any = createTypeScriptWorkerLanguageService({
    typescript: ts as any, compilerOptions, env: env as any, uriConverter, workerContext,
    languagePlugins: [vueLang as any],
    languageServicePlugins: [...createTypeScriptServicePlugin(ts as any), ...plugins],
    setup({ language: l, project }) {
      language = l; projectRef = project;
      tsLs = ts.createLanguageService(project.typescript!.languageServiceHost as any); (globalThis as any).__dbg = { get tsLs() { return tsLs; }, get language() { return language; } };
    },
  });
  svc.debugProps = async (fileName: string, position: number) => {
    const out: any = {};
    try {
      const { sourceScript, virtualCode, program } = withVirtual(fileName); const o2: any = {};
      const serviceScript = sourceScript.generated.languagePlugin.typescript?.getServiceScript(virtualCode); o2.hasServiceScript = !!serviceScript; o2.ssId = serviceScript?.code?.id;
      const ir = virtualCode.ir; o2.hasAst = !!ir.template?.ast; o2.startTagEnd = ir.template?.startTagEnd;
      let node: any; for (const child of forEachElementNode(ir.template.ast)) { if (position >= child.loc.start.offset) node = child; }
      o2.tag = node?.tag; o2.tagType = node?.tagType;
      const t = await import("@volar/typescript/lib/node/transform");
      const p2 = t.toGeneratedOffset(language, serviceScript, sourceScript, ir.template.startTagEnd + node.loc.start.offset, (d: any) => !!d.__propsCompletion);
      o2.position2 = p2; o2.gen = serviceScript.code.snapshot.getText(Math.max(0, p2 - 200), p2) + '<CARET>' + serviceScript.code.snapshot.getText(p2, p2 + 80); o2.genLen = serviceScript.code.snapshot.getLength(); o2.progFiles = program.getSourceFiles().length; o2.progDiagFile = program.getSemanticDiagnostics(program.getSourceFile(virtualCode.fileName)).length; const cc = tsLs.getCompletionsAtPosition(virtualCode.fileName, p2, {} as any); o2.plain = [cc?.isMemberCompletion, cc?.entries.length]; const cb = tsLs.getQuickInfoAtPosition(virtualCode.fileName, p2 - 12); o2.qi = cb && ts.displayPartsToString(cb.displayParts);
      if (p2 !== undefined) { const c = tsLs.getCompletionsAtPosition(virtualCode.fileName, p2, { includeSymbol: true } as any); o2.isMember = c?.isMemberCompletion; o2.nEntries = c?.entries.length; o2.entries = c?.entries.slice(0, 8).map((e) => e.name); }
      out.steps = o2;
    } catch (e: any) { out.stepsErr = String(e.stack).slice(0, 600); }
    try { out.props = client.getComponentProps(fileName, position); } catch (e: any) { out.propsErr = String(e.stack).slice(0, 600); }
    try { out.names = client.getComponentNames(fileName); } catch (e: any) { out.namesErr = String(e.stack).slice(0, 600); }
    try { const { virtualCode, program } = withVirtual(fileName); out.vfile = virtualCode?.fileName; out.hasSrc = !!program.getSourceFile(virtualCode?.fileName); } catch (e: any) { out.vErr = String(e.stack).slice(0, 400); }
    return out;
  };
  return svc;
}
