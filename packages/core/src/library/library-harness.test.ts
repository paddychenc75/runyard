import { join } from "node:path";
import { type AbsPath, absPath, type LengthVerdict, posixRelPath } from "@runyard/platform";
import { createFakePlatform } from "@runyard/testing";
import { expect, it } from "vitest";
import type {
  LibraryStorage,
  PlaygroundSeed,
  PortSlotAllocator,
  SeedFile,
} from "./library-types.ts";
import { PlaygroundLibrary } from "./playground-library.ts";

// 资源库测试共用的现场：假平台的内存文件系统包成 LibraryStorage、顺序分配的端口、
// 可数的 id 序列。放在 *.test.ts 里是因为只有测试文件能导入 @runyard/testing。

export const user = { kind: "user" } as const;

export function seedOf(
  templateId: string,
  files: Record<string, string> = { "index.js": "console.log(1)\n" },
  runner = "node-server",
): PlaygroundSeed {
  const list: SeedFile[] = Object.entries(files).map(([path, contents]) => ({
    path: posixRelPath(path),
    contents,
  }));
  return {
    template: { id: templateId, source: "builtin", appVersion: "0.0.0" },
    runner,
    requires: { node: ">=24" },
    toolchainAtCreate: { node: "24.21.0" },
    files: list,
  };
}

export function createLibraryHarness(options: { root?: AbsPath; idPrefix?: string } = {}) {
  const fake = createFakePlatform();
  const { platform, fs, clock } = fake;
  const root = options.root ?? platform.paths.defaultLibrary;
  const decoder = new TextDecoder();

  const isFile = (path: AbsPath): boolean => {
    try {
      fs.readFile(path);
      return true;
    } catch {
      return false;
    }
  };

  const storage: LibraryStorage = {
    readText: async (path) => (isFile(path) ? fs.readFile(path) : null),
    listDirs: async (dir) => fs.list(dir).filter((name) => !isFile(absPath(join(dir, name)))),
    exists: async (path) => fs.exists(path),
    makeDir: async (path) => fs.mkdir(path),
    writeFile: async (path, data) =>
      fs.writeFile(path, typeof data === "string" ? data : decoder.decode(data)),
    renameFile: async (from, to) => {
      fs.writeFile(to, fs.readFile(from));
      fs.remove(from);
    },
  };

  const allocations: { runner: string; playgroundId: string }[] = [];
  const ports: PortSlotAllocator = {
    allocate: async ({ runner, playgroundId, taken }) => {
      allocations.push({ runner, playgroundId });
      if (runner === "script") return null;
      let port = 7100;
      while (taken.has(port)) port++;
      return port;
    },
  };

  let counter = 0;
  const newId = () => `${options.idPrefix ?? "ID"}-${++counter}`;
  // 路径长度的判断换成可指定的结论：真实判断按 POSIX 分隔符切段，在 Windows 任务上对本机路径不成立
  const open = (opts: { pathLimit?: number; length?: LengthVerdict } = {}) =>
    PlaygroundLibrary.open({
      root,
      platform: opts.length
        ? {
            ...platform,
            paths: { ...platform.paths, checkLength: () => opts.length as LengthVerdict },
          }
        : platform,
      storage,
      ports,
      now: () => clock.now(),
      newId,
      pathLimit: opts.pathLimit ?? 1024,
    });

  const at = (...parts: string[]): AbsPath => absPath(join(root, ...parts));
  const indexPath = absPath(join(platform.paths.stateDir, "state", "library.json"));
  const readJson = (path: AbsPath) => JSON.parse(fs.readFile(path)) as Record<string, unknown>;

  return {
    fake,
    platform,
    fs,
    clock,
    root,
    storage,
    ports,
    allocations,
    newId,
    open,
    at,
    indexPath,
    readJson,
  };
}

export type LibraryHarness = ReturnType<typeof createLibraryHarness>;

it("现场：存储接口把内存文件系统的文件和目录分开，端口顺序分配并跳过已占用的", async () => {
  const h = createLibraryHarness();
  h.fs.writeFile(h.at("a", "f.txt"), "x");
  h.fs.writeFile(h.at("loose.txt"), "y");
  expect(await h.storage.listDirs(h.root)).toEqual(["a"]);
  expect(await h.storage.readText(h.at("a"))).toBeNull();
  expect(await h.ports.allocate({ playgroundId: "i", runner: "r", taken: new Set([7100]) })).toBe(
    7101,
  );
  expect(
    await h.ports.allocate({ playgroundId: "i", runner: "script", taken: new Set() }),
  ).toBeNull();
});
