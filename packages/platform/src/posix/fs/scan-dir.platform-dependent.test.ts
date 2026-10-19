import { mkdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { lstat, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type AbsPath, absPath } from "../../path-types.ts";
import { makeSandbox, type Sandbox } from "../../test-support/trash-sandbox.ts";
import { scanDirPosix } from "./scan-dir.ts";

let box: Sandbox;
const statBig = (path: AbsPath) => stat(path, { bigint: true });
const lstatBig = (path: AbsPath) => lstat(path, { bigint: true });
beforeEach(() => {
  box = makeSandbox();
});
afterEach(() => box.remove());

it("[LIBRARY-DISK-USAGE-08] 临时换成外链后又恢复原目录：拒绝混入外部子项的结果", async () => {
  const child = absPath(box.at("child"));
  const outside = box.at("outside");
  const original = box.at("original");
  mkdirSync(child);
  mkdirSync(outside);
  writeFileSync(join(child, "file"), "inside");
  writeFileSync(join(outside, "file"), new Uint8Array(1_000_000));
  const expected = (await scanDirPosix(child))?.self;
  const result = await scanDirPosix(child, expected, {
    stat: statBig,
    readdir: async (dir) => {
      const names = await readdir(dir);
      renameSync(child, original);
      symlinkSync(outside, child);
      return names;
    },
    lstat: async (path) => {
      const info = await lstatBig(path);
      if (path === join(child, "file")) {
        renameSync(child, box.at("temporary-link"));
        renameSync(original, child);
      }
      return info;
    },
  });
  expect(result?.changed).toBe(true);
  expect(result?.entries).toEqual([]);
});

it("[LIBRARY-DISK-USAGE-08] 父扫描后被换成链接的子目录不再读取", async () => {
  const child = absPath(box.at("child"));
  const outside = box.at("outside");
  mkdirSync(child);
  mkdirSync(outside);
  const expected = (await scanDirPosix(child))?.self;
  if (expected === undefined) throw new Error("缺少原目录的身份");
  renameSync(child, box.at("original"));
  symlinkSync(outside, child);
  const read = vi.fn(async (dir) => readdir(dir));
  const result = await scanDirPosix(child, expected, {
    stat: statBig,
    lstat: lstatBig,
    readdir: read,
  });
  expect(result?.changed).toBe(true);
  expect(result?.entries).toEqual([]);
  expect(read).not.toHaveBeenCalled();
});

it("[LIBRARY-DISK-USAGE-08] 目录读取过程中被换成外部链接：末尾身份核对拒绝结果", async () => {
  const child = absPath(box.at("child"));
  const outside = box.at("outside");
  mkdirSync(child);
  mkdirSync(outside);
  writeFileSync(join(child, "file"), "inside");
  writeFileSync(join(outside, "file"), "outside");
  const expected = (await scanDirPosix(child))?.self;
  const result = await scanDirPosix(child, expected, {
    stat: statBig,
    lstat: lstatBig,
    readdir: async (dir) => {
      const names = await readdir(dir);
      renameSync(child, box.at("original"));
      symlinkSync(outside, child);
      return names;
    },
  });
  expect(result?.changed).toBe(true);
  expect(result?.entries).toEqual([]);
});
