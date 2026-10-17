import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { build } from "esbuild";

// 随应用安装的运行时（技术设计 §8.2）：管理进程和命令行各打成单个文件，内置模板数据和一份清单放在旁边，
// 加上 PATH 上要链接的启动脚本。这些文件由 electron-builder 作为 extraResources 放进 Contents/Resources，
// 不进 asar（要被应用的可执行文件当 Node 直接运行）。
//
//   <outDir>/runyard/supervisor.mjs   管理进程（packages/supervisor/src/main-packaged.ts）
//   <outDir>/runyard/cli.mjs          命令行（packages/cli/src/main-packaged.ts）
//   <outDir>/runyard/manifest.json    { version, build, templates: 模板数据的校验和 }
//   <outDir>/runyard/templates/       builtin、runners、tools
//   <outDir>/bin/runyard              启动脚本

export interface RuntimeManifest {
  /** 应用版本；命令行和管理进程的版本都取它 */
  version: string;
  /** 构建标识：版本号加构建时的随机串（决策记录 0007 第 6 条），原地替换 .app 后靠它认出旧的管理进程 */
  build: string;
  /** 模板数据（templates/ 下全部文件）的 sha256 */
  templates: string;
}

export interface RuntimeBundleInputs {
  repoRoot: string;
  outDir: string;
  version: string;
  /** 缺省用随机串；测试里给定值 */
  buildSuffix?: string;
}

const TEMPLATE_DIRS = ["builtin", "runners", "tools"] as const;

/** 目录下全部文件（按相对路径排序）的内容校验和；路径和内容都参与 */
export function digestTree(root: string): string {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(root);
  const hash = createHash("sha256");
  for (const file of files.map((path) => relative(root, path)).sort()) {
    hash
      .update(`${file}\0`)
      .update(readFileSync(join(root, file)))
      .update("\0");
  }
  return hash.digest("hex");
}

export async function buildRuntimeBundle(inputs: RuntimeBundleInputs): Promise<RuntimeManifest> {
  const { repoRoot, outDir, version } = inputs;
  const runtimeDir = join(outDir, "runyard");
  mkdirSync(runtimeDir, { recursive: true });

  const entries = [
    ["packages/supervisor/src/main-packaged.ts", "supervisor.mjs"],
    ["packages/cli/src/main-packaged.ts", "cli.mjs"],
  ] as const;
  for (const [entry, outfile] of entries) {
    await build({
      entryPoints: [join(repoRoot, entry)],
      outfile: join(runtimeDir, outfile),
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      logLevel: "warning",
      // 打进来的 CommonJS 依赖需要 require
      banner: {
        js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
      },
    });
  }

  const templatesDir = join(runtimeDir, "templates");
  for (const name of TEMPLATE_DIRS) {
    cpSync(join(repoRoot, "templates", name), join(templatesDir, name), { recursive: true });
  }

  const manifest: RuntimeManifest = {
    version,
    build: `${version}-${inputs.buildSuffix ?? randomBytes(4).toString("hex")}`,
    templates: digestTree(templatesDir),
  };
  writeFileSync(join(runtimeDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  mkdirSync(join(outDir, "bin"), { recursive: true });
  const launcher = join(outDir, "bin", "runyard");
  copyFileSync(join(import.meta.dirname, "bin", "runyard"), launcher);
  chmodSync(launcher, 0o755);
  return manifest;
}
