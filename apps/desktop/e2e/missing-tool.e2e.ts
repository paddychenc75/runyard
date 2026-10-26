import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWithKeyboard, expect, test } from "./support/fixtures.ts";
import type { RunyardApp } from "./support/launch.ts";

// 过旧的工具（issue #427）：用设置里的“指定路径”把工具指到一个只会报旧版本号的假程序，
// 三类项目（网页、服务、脚本）都必须显示缺工具画面，而且不能把上一次成功运行的输出当成这次的结果。

function fakeTool(runyard: RunyardApp, name: string, version: string): string {
  const dir = join(runyard.home, "fake-tools");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, `#!/bin/sh\necho "${version}"\n`);
  chmodSync(file, 0o755);
  return file;
}

// 脚本项目要先成功运行一次，才能验证“过旧后不留旧输出”。机器自带的 python3 可能低于模板要求的 3.12
// （macOS 自带 3.9），所以先指向一个只对版本探测谎报 3.12 的转发程序，其余调用转给本机的 python3：
// 测试因此不再依赖本机装了哪一版 Python。
function pythonShim(runyard: RunyardApp): string {
  const dir = join(runyard.home, "python-shim");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "python3");
  writeFileSync(
    file,
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Python 3.12.0"; exit 0; fi\nexec python3 "$@"\n',
  );
  chmodSync(file, 0o755);
  return file;
}

test("[DESKTOP-WORKSPACE-18] 脚本项目：工具过旧时显示缺工具画面，不显示上一次成功运行的输出", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page } = runyard;
  await runyard.call("settings.set", { toolPaths: { python: pythonShim(runyard) } });
  await createWithKeyboard(page, "Python script");
  const output = page.getByRole("region", { name: "Process output" });
  await expect(output.getByRole("log")).toContainText("Hello, Runyard!");

  const python = fakeTool(runyard, "python3", "Python 3.8.0");
  await runyard.call("settings.set", { toolPaths: { python } });
  await output.getByRole("button", { name: "Run" }).click();

  const missing = page.locator("[data-failure-screen=missing]");
  await expect(missing).toBeVisible();
  await expect(missing).toContainText("3.8.0");
  await expect(missing).toContainText("Check again");
  await expect(page.getByText("Hello, Runyard!")).toHaveCount(0);
  await expect(page.getByText(/failed to start/i)).toHaveCount(0);
});

for (const [kind, template] of [
  ["网页", "React 19"],
  ["服务", "Hono"],
] as const) {
  test(`[DESKTOP-WORKSPACE-18] ${kind}项目：node 过旧时显示缺工具画面`, async ({ launch }) => {
    const runyard = await launch();
    const { page } = runyard;
    const node = fakeTool(runyard, "node", "v18.0.0");
    await runyard.call("settings.set", { toolPaths: { node } });
    await createWithKeyboard(page, template);
    const missing = page.locator("[data-failure-screen=missing]");
    await expect(missing).toBeVisible();
    await expect(missing).toContainText("18.0.0");
  });
}
