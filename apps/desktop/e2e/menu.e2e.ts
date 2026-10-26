import { closePicker, expect, test } from "./support/fixtures.ts";
import type { RunyardApp } from "./support/launch.ts";

// 应用菜单（#432）：导出主进程里真实安装的菜单（不点系统菜单栏），核对结构、语言和开发项。
// 打好的包（RUNYARD_E2E_APP）里不许有重新载入和开发者工具；从源码运行时它们在。

interface Dumped {
  label: string;
  role?: string;
  accelerator?: string;
  items: { label: string; role?: string; accelerator?: string; visible: boolean }[];
}

async function dump(app: RunyardApp["app"]): Promise<Dumped[]> {
  return app.evaluate(({ Menu }) =>
    (Menu.getApplicationMenu()?.items ?? []).map((top) => ({
      label: top.label,
      items: (top.submenu?.items ?? [])
        .filter((item) => item.type !== "separator")
        .map((item) => ({
          label: item.label,
          role: item.role,
          accelerator: item.accelerator ? String(item.accelerator) : undefined,
          visible: item.visible,
        })),
    })),
  ) as Promise<Dumped[]>;
}

test("应用菜单：中文，标准结构，没有英文夹杂，正式包里没有开发项", async ({ launch }) => {
  const runyard = await launch({ lang: "zh-CN", theme: "light" });
  const menu = await dump(runyard.app);
  expect(menu.map((top) => top.label)).toEqual([
    "Runyard",
    "文件",
    "编辑",
    "显示",
    "项目",
    "窗口",
    "帮助",
  ]);
  const labels = menu.flatMap((top) => top.items.map((item) => item.label));
  for (const label of labels) expect(label.replaceAll("Runyard", "")).not.toMatch(/[A-Za-z]/);
  const roles = menu.flatMap((top) => top.items.map((item) => item.role));
  const settings = menu[0]?.items.find((item) => item.label === "设置…");
  expect(settings?.accelerator).toBe("CmdOrCtrl+,");
  expect(labels).toContain("检查更新…");
  if (process.env.RUNYARD_E2E_APP !== undefined) {
    for (const role of ["reload", "forcereload", "toggledevtools"]) {
      expect(roles.map((value) => value?.toLowerCase())).not.toContain(role);
    }
  }
});

test("应用菜单：英文，⌘, 打开设置页", async ({ launch }) => {
  const runyard = await launch({ lang: "en", theme: "light" });
  await closePicker(runyard.page);
  const menu = await dump(runyard.app);
  expect(menu.map((top) => top.label)).toEqual([
    "Runyard",
    "File",
    "Edit",
    "View",
    "Playground",
    "Window",
    "Help",
  ]);
  for (const item of menu.flatMap((top) => top.items)) {
    expect(item.label).not.toMatch(/[一-鿿]/);
  }
  await runyard.app.evaluate(({ Menu }) => {
    const items = Menu.getApplicationMenu()?.items.flatMap((top) => top.submenu?.items ?? []) ?? [];
    items.find((item) => item.accelerator === "CmdOrCtrl+,")?.click();
  });
  const settings = runyard.page;
  await expect(settings.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(runyard.page.getByRole("tab", { name: /Library/ })).toHaveCount(0);
  expect(
    await runyard.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
  ).toBe(1);
});
