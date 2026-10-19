import { compareScrollbars, openScrollableEditor } from "./support/editor-theme.ts";
import { expect, test } from "./support/fixtures.ts";

for (const lang of ["zh-CN", "en"] as const) {
  test(`[DESKTOP-EDITOR-39] ${lang} 编辑器主题即时切换，普通与悬停滑块颜色和共享滚动条一致`, async ({
    launch,
  }, info) => {
    const instance = await launch({ lang, theme: "light" });
    await openScrollableEditor(instance);
    const fileTab = instance.page.getByRole("tab", { name: /index.html/ });
    await expect(fileTab).toBeVisible();
    for (const theme of ["light", "dark"] as const) {
      const result = await compareScrollbars(instance, theme);
      await expect(fileTab).toBeVisible();
      await instance.page.screenshot({ path: info.outputPath(`${theme}-${lang}.png`) });
      await info.attach(`${theme}-${lang}-colors`, {
        body: JSON.stringify(result, (_key, value) =>
          _key === "monaco" || _key === "shared" ? undefined : value,
        ),
        contentType: "application/json",
      });
    }
  });
}
