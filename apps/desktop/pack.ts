import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Arch, build, Platform } from "electron-builder";
import { builderConfig } from "./packaging/builder-config.ts";
import { E2E_FUSES, RELEASE_FUSES } from "./packaging/fuses.ts";
import { syncIcon } from "./packaging/icon.ts";
import { assertNodePty, stageNodePty } from "./packaging/node-pty.ts";
import { buildRuntimeBundle } from "./packaging/runtime-bundle.ts";
import { assertFuses } from "./packaging/verify-fuses.ts";
import {
  buildVueLanguageService,
  VUE_LANGUAGE_SERVICE_DIR,
  vueLanguageServiceProblems,
} from "./packaging/vue-language-service.ts";

// 打包本体：拼应用目录、electron-builder 出 .app（加 dmg、zip）、读二进制里的开关并断言（技术设计 §8.2、决策记录 0007）。
// 不直接运行：入口是 tooling/scripts/package-desktop.ts（`pnpm --filter @runyard/desktop package`），
// 它先构建、下载 Electron，打包后再用 codesign 校验。参数同入口：--out <目录>、--dir、--e2e。

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const require = createRequire(import.meta.url);

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** 用已经下载好的 Electron（下载是 package-desktop.ts 里单独的一步）；没有就报错，不在这里悄悄联网 */
function installedElectron(): { dist: string; version: string } {
  const packageDir = dirname(require.resolve("electron/package.json"));
  if (!existsSync(join(packageDir, "path.txt"))) {
    throw new Error(
      "Electron 二进制还没下载：先运行 pnpm --filter @runyard/desktop electron:download",
    );
  }
  const executable = require("electron") as string;
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
    version: string;
  };
  console.log(`Electron ${manifest.version}：${executable}`);
  return { dist: join(packageDir, "dist"), version: manifest.version };
}

const requestedOut = resolve(option("--out") ?? join(here, "release"));
mkdirSync(requestedOut, { recursive: true });
const outDir = realpathSync(requestedOut);
const e2e = process.argv.includes("--e2e");
const fuses = e2e ? E2E_FUSES : RELEASE_FUSES;

syncIcon(repoRoot);
const electron = installedElectron();

console.log("拼应用目录并打包");
// 应用目录里只放 esbuild 的产物和一个最小的 package.json：依赖已经打进单文件，
// 不让打包工具去跟随工作区的依赖链接
const appDir = join(outDir, "stage");
mkdirSync(appDir, { recursive: true });
cpSync(join(here, "dist"), join(appDir, "dist"), { recursive: true });
const source = JSON.parse(readFileSync(join(here, "package.json"), "utf8")) as {
  version: string;
  main: string;
};
// node-pty 带原生文件，不能打进单文件：拷成真实目录，写进最小 package.json 的 dependencies（K5 证据）
const nodePtyDir = dirname(require.resolve("node-pty/package.json"));
const nodePtyVersion = (
  JSON.parse(readFileSync(join(nodePtyDir, "package.json"), "utf8")) as { version: string }
).version;
stageNodePty(appDir, nodePtyDir);
writeFileSync(
  join(appDir, "package.json"),
  `${JSON.stringify({ name: "runyard", productName: "Runyard", version: source.version, main: source.main, type: "module", dependencies: { "node-pty": nodePtyVersion } }, null, 2)}\n`,
);

console.log("打包管理进程、命令行和内置模板");
const runtimeDir = join(outDir, "runtime");
const manifest = await buildRuntimeBundle({
  repoRoot,
  outDir: runtimeDir,
  version: source.version,
});
console.log(`版本 ${manifest.version}，构建标识 ${manifest.build}`);

console.log("准备 Vue 语言服务目录");
const vueLanguageServiceDir = await buildVueLanguageService(here, outDir);

const config = builderConfig({
  runtimeDir,
  vueLanguageServiceDir,
  outDir,
  buildResources: join(here, "build"),
  electronDist: electron.dist,
  electronVersion: electron.version,
  fuses,
});
const dirOnly = process.argv.includes("--dir");
await build({
  projectDir: appDir,
  targets: Platform.MAC.createTarget(dirOnly ? "dir" : undefined, Arch.arm64),
  config,
  publish: "never",
});

console.log("校验终端的原生模块");
assertNodePty(join(outDir, "mac-arm64", "Runyard.app", "Contents", "Resources"));

console.log("校验 Vue 语言服务目录");
const vueProblems = vueLanguageServiceProblems(
  join(outDir, "mac-arm64", "Runyard.app", "Contents", "Resources", VUE_LANGUAGE_SERVICE_DIR),
);
if (vueProblems.length > 0) throw new Error(vueProblems.join("\n"));

console.log("校验打包开关");
const app = join(outDir, "mac-arm64", "Runyard.app");
await assertFuses(join(app, "Contents", "MacOS", "Runyard"), fuses);
console.log(`开关符合要求：${app}`);
