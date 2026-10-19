import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base } from "@playwright/test";
import { serveScreens } from "./build.ts";

export const test = base.extend<object, { screenUrl: string }>({
  screenUrl: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium")
        throw new Error("画面基准只验证锁定的Chromium，不混用其它引擎。");
      const out = mkdtempSync(join(tmpdir(), "ry-desktop-visual-"));
      const server = await serveScreens(out);
      try {
        await use(server.url);
      } finally {
        await server.stop();
      }
    },
    { scope: "worker" },
  ],
});
export { expect } from "@playwright/test";
