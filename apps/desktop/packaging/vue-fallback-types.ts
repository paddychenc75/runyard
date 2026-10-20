import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, sep } from "node:path";
import { build } from "esbuild";

interface Package {
  name: string;
  version: string;
  license?: string;
  dependencies?: Record<string, string>;
}
function packageOf(name: string, from: string): string {
  for (let folder = from; ; folder = dirname(folder)) {
    const path = join(folder, "node_modules", name);
    if (existsSync(join(path, "package.json"))) return realpathSync(path);
    if (dirname(folder) === folder) throw new Error(`Vue 声明资产缺少 ${name}`);
  }
}
/** 只复制已有锁定依赖的声明、元数据和许可证，不复制/执行任何 Vue JavaScript。 */
export async function buildVueFallbackTypes(desktopDir: string, service: string): Promise<void> {
  const copied = new Map<string, Package>();
  const copy = (name: string, from: string) => {
    const source = packageOf(name, from);
    const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8")) as Package;
    const previous = copied.get(name);
    if (previous) {
      if (previous.version !== manifest.version) throw new Error(`Vue 声明闭包 ${name} 有多个版本`);
      return;
    }
    copied.set(name, manifest);
    cpSync(source, join(service, "fallback-types", "node_modules", name), {
      recursive: true,
      dereference: true,
      filter: (path) =>
        path === source ||
        (statSync(path).isDirectory()
          ? !path
              .slice(source.length + 1)
              .split(sep)
              .includes("node_modules")
          : path.endsWith("package.json") ||
            /\.d\.[cm]?ts$/.test(path) ||
            /[/\\](license|licence|copying)([.-][^/\\]*)?$/i.test(path)),
    });
    for (const dependency of Object.keys(manifest.dependencies ?? {})) copy(dependency, source);
  };
  copy("vue", join(desktopDir, "..", "..", "tooling"));
  const directory = join(service, "node_modules", "@runyard", "vue-types-fallback");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "@runyard/vue-types-fallback", main: "index.cjs" }),
  );
  await build({
    entryPoints: [join(desktopDir, "src", "main", "integration", "vue-types-fallback.ts")],
    outfile: join(directory, "index.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    logLevel: "warning",
    footer: { js: "module.exports = module.exports.createVueTypesFallback;" },
  });
  writeFileSync(
    join(service, "fallback-types", "manifest.json"),
    `${JSON.stringify(
      [...copied.values()].map(({ name, version, license }) => ({ name, version, license })),
      null,
      2,
    )}\n`,
  );
}
