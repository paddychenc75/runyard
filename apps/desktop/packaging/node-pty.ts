import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// node-pty 的打包（K5 证据 docs/architecture/evidence/k5-node-pty.md 的“需要的配置”）：
// 1. 拷成应用目录 node_modules 里的真实目录（不能被 esbuild 打进主进程单文件，也不能是 pnpm 的符号链接）；
// 2. 只带 macOS 的预编译文件，Windows 的不带（第一版不做 Windows，决策记录 0013）；
// 3. spawn-helper 在 npm 包和 pnpm 安装目录里是 0644，不加可执行位就开不出 shell（posix_spawnp failed.），
//    所以拷完 chmod 755，打完包再断言应用里的两份都有可执行位；
// 4. 拷出来的 package.json 去掉 dependencies、devDependencies 和 scripts：node-addon-api 只在从源码编译时用（运行时无依赖，K5 证据），
//    留着的话 electron-builder 找不到它会整个打包失败，安装脚本也不该跟进包里。

const PREBUILD_DIRS = ["darwin-arm64", "darwin-x64"] as const;
const EXECUTABLE = 0o111;

/** 把 node-pty 拷进应用目录的 node_modules；sourceDir 是装好的 node-pty 包目录 */
export function stageNodePty(appDir: string, sourceDir: string): string {
  const target = join(appDir, "node_modules", "node-pty");
  mkdirSync(target, { recursive: true });
  for (const entry of ["lib", "package.json", "LICENSE"]) {
    // dereference：pnpm 装下来的是符号链接和硬链接，拷成真实文件
    cpSync(join(sourceDir, entry), join(target, entry), { recursive: true, dereference: true });
  }
  const manifest = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  for (const field of ["dependencies", "devDependencies", "scripts"]) delete manifest[field];
  writeFileSync(join(target, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const dir of PREBUILD_DIRS) {
    const from = join(sourceDir, "prebuilds", dir);
    if (!existsSync(from)) throw new Error(`node-pty 没有 ${dir} 的预编译文件：${from}`);
    cpSync(from, join(target, "prebuilds", dir), { recursive: true, dereference: true });
    chmodSync(join(target, "prebuilds", dir, "spawn-helper"), 0o755);
  }
  return target;
}

/** 打好的应用里 node-pty 必须在 asar 之外、文件齐全、spawn-helper 可执行；返回问题清单（空是通过） */
export function nodePtyProblems(resourcesDir: string): string[] {
  const root = join(resourcesDir, "app.asar.unpacked", "node_modules", "node-pty");
  if (!existsSync(root)) return [`node-pty 没有解到 asar 之外：${root}`];
  const problems: string[] = [];
  for (const dir of PREBUILD_DIRS) {
    for (const file of ["pty.node", "spawn-helper"]) {
      const path = join(root, "prebuilds", dir, file);
      if (!existsSync(path)) problems.push(`缺少 ${dir}/${file}`);
    }
    const helper = join(root, "prebuilds", dir, "spawn-helper");
    if (existsSync(helper) && (statSync(helper).mode & EXECUTABLE) !== EXECUTABLE) {
      problems.push(`${dir}/spawn-helper 没有可执行位（开终端会报 posix_spawnp failed.）`);
    }
  }
  const prebuilds = join(root, "prebuilds");
  if (existsSync(prebuilds)) {
    for (const dir of readdirSync(prebuilds)) {
      if (dir.startsWith("win32-")) problems.push(`不该带 Windows 的预编译文件：${dir}`);
    }
  }
  return problems;
}

export function assertNodePty(resourcesDir: string): void {
  const problems = nodePtyProblems(resourcesDir);
  if (problems.length > 0) throw new Error(`node-pty 打包不符合要求：\n${problems.join("\n")}`);
}
