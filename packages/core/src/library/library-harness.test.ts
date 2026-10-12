import { join } from "node:path";
import { type AbsPath, absPath, type LengthVerdict, posixRelPath } from "@runyard/platform";
import { createFakePlatform } from "@runyard/testing";
import { expect, it } from "vitest";
import type { PlaygroundSeed, PortSlotAllocator, SeedFile } from "./library-types.ts";
import { PlaygroundLibrary } from "./playground-library.ts";

// 资源库测试共用的现场：假平台的内存文件系统（经平台接口 fs）、顺序分配的端口、
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
  // 先过一遍 join 归一化分隔符：内存文件系统按字符串比较路径，Windows 任务上混着写会对不上
  const root = absPath(join(options.root ?? platform.paths.defaultLibrary));
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
  const open = (opts: { maxPathLength?: number; length?: LengthVerdict } = {}) =>
    PlaygroundLibrary.open({
      root,
      platform:
        opts.length || opts.maxPathLength
          ? {
              ...platform,
              paths: {
                ...platform.paths,
                ...(opts.length ? { checkLength: () => opts.length as LengthVerdict } : {}),
                ...(opts.maxPathLength ? { maxPathLength: opts.maxPathLength } : {}),
              },
            }
          : platform,
      ports,
      now: () => clock.now(),
      newId,
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

it("现场：平台接口把内存文件系统的文件和目录分开，端口顺序分配并跳过已占用的", async () => {
  const h = createLibraryHarness();
  h.fs.writeFile(h.at("a", "f.txt"), "x");
  h.fs.writeFile(h.at("loose.txt"), "y");
  expect(await h.platform.fs.listDirs(h.root)).toEqual(["a"]);
  expect(await h.platform.fs.readText(h.at("a"))).toBeNull();
  expect(await h.ports.allocate({ playgroundId: "i", runner: "r", taken: new Set([7100]) })).toBe(
    7101,
  );
  expect(
    await h.ports.allocate({ playgroundId: "i", runner: "script", taken: new Set() }),
  ).toBeNull();
});
