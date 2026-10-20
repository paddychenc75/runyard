import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, sep } from "node:path";
import { build } from "esbuild";
import {
  VUE_LANGUAGE_SERVICE_DIR,
  VUE_LANGUAGE_SERVICE_PATHS,
} from "../src/main/vue-language/service-paths.ts";
import { buildVueFallbackTypes } from "./vue-fallback-types.ts";

// 随应用带的“语言服务目录”（决策记录 0021 第 4 条，证据 vue-intellisense.md“第二次验证”）。
// 放进 .app 的 Contents/Resources，不进 asar：Node 的权限模型要按真实路径授权读权限，
// 起进程的是应用自带的 Electron 当 Node（ELECTRON_RUN_AS_NODE）。目录结构：
//
//   <dir>/server/vue-language-server.cjs   Vue 语言服务器，esbuild 打成一个文件
//   <dir>/types/                           @vue/language-core 的类型文件，必须在打包文件的上一级（坑 5）
//   <dir>/node_modules/@vue/typescript-plugin 及其依赖   原样复制，不打包（坑 6）；tsserver 用 --pluginProbeLocations 指到 <dir>
//   <dir>/typescript/lib/                  tsserver 与 typescript.js，两个进程共用的 --tsdk
//   <dir>/manifest.json                    各部分的版本，供守卫脚本和测试核对

export {
  VUE_LANGUAGE_SERVICE_DIR,
  VUE_LANGUAGE_SERVICE_PATHS,
} from "../src/main/vue-language/service-paths.ts";

export interface VueLanguageServiceManifest {
  vueLanguageServer: string;
  vueTypescriptPlugin: string;
  typescript: string;
}

function packageDir(name: string, from: string): string {
  // 包的 exports 不一定放行 package.json，所以沿目录向上找 node_modules/<name>
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dirname(dir) === dir) throw new Error(`找不到依赖 ${name}（从 ${from} 起）`);
  }
}

function readManifest(dir: string): {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

/** 运行时依赖的闭包：从入口包出发，只跟 dependencies（不跟 peer、dev），返回 名称到真实目录 */
function runtimeClosure(entry: string): Map<string, string> {
  const found = new Map<string, string>();
  const visit = (linked: string) => {
    // pnpm 的依赖是符号链接：要从真实目录往上找才找得到同级的依赖
    const dir = realpathSync(linked);
    const manifest = readManifest(dir);
    if (found.has(manifest.name)) return;
    found.set(manifest.name, dir);
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      visit(packageDir(dep, dir));
    }
  };
  visit(entry);
  return found;
}

const DROPPED_SUFFIXES = [".map", ".md", ".d.ts", ".d.mts", ".d.cts"];

/** 复制一个包：去掉 .map、.md 和类型声明（语言服务目录里的类型文件另有保留），不带包内嵌套的 node_modules */
function copyPackage(
  source: string,
  target: string,
  keepDeclarations: (relative: string) => boolean,
) {
  cpSync(source, target, {
    recursive: true,
    // pnpm 装下来的是符号链接和硬链接，拷成真实文件
    dereference: true,
    filter: (path) => {
      const relative = path.slice(source.length + 1);
      if (relative === "") return true;
      if (relative.split(sep).includes("node_modules")) return false;
      if (statSync(path).isDirectory()) return true;
      if (DROPPED_SUFFIXES.some((suffix) => path.endsWith(suffix))) {
        return keepDeclarations(relative) && !path.endsWith(".map") && !path.endsWith(".md");
      }
      return true;
    },
  });
}

/** TypeScript 只带 tsserver 要的文件（证据“体积”一节） */
function copyTypescript(source: string, target: string) {
  const lib = join(source, "lib");
  mkdirSync(join(target, "lib"), { recursive: true });
  cpSync(join(source, "package.json"), join(target, "package.json"));
  for (const name of readdirSync(lib)) {
    const keep =
      name === "typescript.js" ||
      name === "_tsserver.js" ||
      name === "tsserver.js" ||
      (name.startsWith("lib.") && name.endsWith(".d.ts")) ||
      name === "zh-cn";
    if (keep) cpSync(join(lib, name), join(target, "lib", name), { recursive: true });
  }
}

/** 在 outDir 下生成语言服务目录，返回它的路径。desktopDir 是 apps/desktop（从它解析依赖） */
export async function buildVueLanguageService(desktopDir: string, outDir: string): Promise<string> {
  const root = join(outDir, VUE_LANGUAGE_SERVICE_DIR);
  mkdirSync(root, { recursive: true });

  const serverPackage = packageDir("@vue/language-server", desktopDir);
  const pluginPackage = packageDir("@vue/typescript-plugin", desktopDir);
  const tsPackage = packageDir("typescript", desktopDir);

  // 1. 语言服务器打成一个文件。mainFields 写 module,main，否则选中 vscode-json-languageservice 的 UMD 版，
  // 启动就找不到 ./services/jsonCompletion（坑 4）。typescript 不打进去：运行时从 --tsdk 指的目录加载
  await build({
    entryPoints: [join(serverPackage, "bin", "vue-language-server.js")],
    outfile: join(root, VUE_LANGUAGE_SERVICE_PATHS.server),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    mainFields: ["module", "main"],
    minify: true,
    external: ["typescript"],
    logLevel: "warning",
  });

  await build({
    entryPoints: [join(desktopDir, "src", "main", "integration", "vue-network-guard.ts")],
    outfile: join(root, VUE_LANGUAGE_SERVICE_PATHS.guard),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    logLevel: "warning",
  });

  // 2. 插件及其依赖原样放进 node_modules/，扁平摆放（同名包的版本在锁文件里只有一份，下面核对）
  const closure = runtimeClosure(pluginPackage);
  closure.delete("typescript");
  for (const [name, dir] of closure) {
    copyPackage(
      dir,
      join(root, "node_modules", name),
      (relative) => name === "@vue/language-core" && relative.split(sep)[0] === "types",
    );
  }
  const languageCore = closure.get("@vue/language-core");
  if (!languageCore) throw new Error("@vue/typescript-plugin 的依赖里没有 @vue/language-core");
  cpSync(join(languageCore, "types"), join(root, VUE_LANGUAGE_SERVICE_PATHS.types), {
    recursive: true,
    dereference: true,
  });

  // 3. TypeScript
  copyTypescript(tsPackage, join(root, "typescript"));

  await buildVueFallbackTypes(desktopDir, root);

  const manifest: VueLanguageServiceManifest = {
    vueLanguageServer: readManifest(serverPackage).version,
    vueTypescriptPlugin: readManifest(pluginPackage).version,
    typescript: readManifest(tsPackage).version,
  };
  writeFileSync(
    join(root, VUE_LANGUAGE_SERVICE_PATHS.manifest),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return root;
}

/** 语言服务目录必须齐全、插件没被打包、版本与声明一致；返回问题清单（空是通过） */
export function vueLanguageServiceProblems(root: string): string[] {
  const problems: string[] = [];
  const required = [
    VUE_LANGUAGE_SERVICE_PATHS.guard,
    join("fallback-types", "manifest.json"),
    join("fallback-types", "node_modules", "vue", "dist", "vue.d.ts"),
    join("node_modules", "@runyard", "vue-types-fallback", "index.cjs"),
    VUE_LANGUAGE_SERVICE_PATHS.server,
    VUE_LANGUAGE_SERVICE_PATHS.manifest,
    join(VUE_LANGUAGE_SERVICE_PATHS.types, "template-helpers.d.ts"),
    join(VUE_LANGUAGE_SERVICE_PATHS.plugin, "package.json"),
    join(VUE_LANGUAGE_SERVICE_PATHS.plugin, "index.js"),
    join("node_modules", "@vue", "language-core", "types", "template-helpers.d.ts"),
    join(VUE_LANGUAGE_SERVICE_PATHS.tsdk, "typescript.js"),
    VUE_LANGUAGE_SERVICE_PATHS.tsserver,
    join(VUE_LANGUAGE_SERVICE_PATHS.tsdk, "_tsserver.js"),
    join(VUE_LANGUAGE_SERVICE_PATHS.tsdk, "lib.d.ts"),
    join(VUE_LANGUAGE_SERVICE_PATHS.tsdk, "zh-cn"),
    join("typescript", "package.json"),
  ];
  for (const path of required) {
    if (!existsSync(join(root, path))) problems.push(`语言服务目录缺少 ${path}`);
  }
  // 版本核对：@vue/language-server 与 @vue/typescript-plugin 必须同版本，且与打进来的文件一致
  const manifestPath = join(root, VUE_LANGUAGE_SERVICE_PATHS.manifest);
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as VueLanguageServiceManifest;
    if (manifest.vueLanguageServer !== manifest.vueTypescriptPlugin) {
      problems.push(
        `@vue/language-server ${manifest.vueLanguageServer} 与 @vue/typescript-plugin ${manifest.vueTypescriptPlugin} 版本不同`,
      );
    }
    const pluginManifest = join(root, VUE_LANGUAGE_SERVICE_PATHS.plugin, "package.json");
    if (
      existsSync(pluginManifest) &&
      readManifest(dirname(pluginManifest)).version !== manifest.vueTypescriptPlugin
    ) {
      problems.push("复制进来的 @vue/typescript-plugin 与清单里的版本不一致");
    }
  }
  // 插件必须原样带上：打成一个文件后脚本侧的悬停、跳转全部失效（证据坑 6）
  const pluginDir = join(root, VUE_LANGUAGE_SERVICE_PATHS.plugin);
  if (existsSync(pluginDir) && readdirSync(join(pluginDir, "lib")).length < 2) {
    problems.push("@vue/typescript-plugin 的 lib 不像原样复制（文件太少）");
  }
  return problems;
}
