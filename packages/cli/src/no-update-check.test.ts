import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Harness } from "./cli-harness.test.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function sources(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sources(path)));
    else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) found.push(path);
  }
  return found;
}

describe("命令行不检查更新", () => {
  it("[DESKTOP-SETTINGS-31] 运行各种命令时没有发出任何网络请求", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        requests.push(String(input));
        throw new TypeError("no network in tests");
      }),
    );
    const h = new Harness({
      host: {
        install: { kind: "app", version: "0.2.0", path: "/Applications/Runyard.app/runyard" },
      },
    });
    try {
      for (const args of [
        ["--version"],
        ["--help"],
        ["status"],
        ["config", "get", "lang"],
        ["doctor"],
      ]) {
        await h.run(args);
      }
    } finally {
      await h.dispose();
    }
    expect(requests).toEqual([]);
  });

  it("[DESKTOP-SETTINGS-31] 命令行的源码里没有联网的代码，也没有发布页的地址", async () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const offenders: string[] = [];
    for (const file of await sources(root)) {
      const text = await readFile(file, "utf8");
      if (/\bfetch\(|node:https?|node:net\b|api\.github\.com|releases\/latest/.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
