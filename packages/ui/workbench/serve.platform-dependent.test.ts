// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serveWorkbench } from "./build.ts";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("工作台服务", () => {
  it("在 127.0.0.1 的空闲端口上提供页面和脚本，停止之后端口释放", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "runyard-workbench-serve-"));
    cleanups.push(() => rmSync(outDir, { recursive: true, force: true })); // delete-allow: 测试自己建的临时目录
    const { url, stop } = await serveWorkbench(outDir, 0);
    let stopped = false;
    cleanups.push(async () => {
      if (!stopped) await stop();
    });
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const page = await fetch(url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<div id="root">');
    const script = await fetch(`${url}main.js`);
    expect(script.status).toBe(200);
    await stop();
    stopped = true;
    await expect(fetch(url)).rejects.toThrow();
  });
});
