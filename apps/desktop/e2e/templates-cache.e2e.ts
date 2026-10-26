import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./support/fixtures.ts";

test("[DESKTOP-TEMPLATES-VIEW-03] [DESKTOP-TEMPLATES-VIEW-04] 修改工具路径后当前模板详情更新缓存而不重进页面", async ({
  launch,
}) => {
  const instance = await launch({ lang: "en", theme: "light" });
  const page = instance.page;
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  const paths = ["1.26.2", "1.26.3"].map((version) => {
    const path = join(instance.home, `go-${version}`);
    writeFileSync(path, `#!/bin/sh\nprintf '%s\\n' 'go version go${version} darwin/arm64'\n`);
    chmodSync(path, 0o755);
    return path;
  });
  expect(await instance.call("toolchain.setPath", { tool: "go", path: paths[0] })).toMatchObject({
    status: "set",
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^Templates/ })
    .click();
  await page.getByRole("option", { name: /^Go/ }).click();
  const tool = page.locator('tr[data-tool="go"]');
  await expect(tool).toContainText("1.26.2");
  expect(await instance.call("toolchain.setPath", { tool: "go", path: paths[1] })).toMatchObject({
    status: "set",
  });
  await expect(tool).toContainText("1.26.3");
  await expect(tool).not.toContainText("1.26.2");
  await expect(page.getByRole("option", { name: /^Go/ })).toHaveAttribute("aria-selected", "true");
});
