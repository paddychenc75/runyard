import { brandThemeCases, checkBrandTheme } from "./sidebar-brand-theme.ts";
import { closePicker, test } from "./support/fixtures.ts";
import { showLibrarySidebar } from "./support/library-sidebar.ts";

for (const choice of brandThemeCases) {
  test(`品牌 A：应用 ${choice.theme} / 系统 ${choice.system} 使用 ${choice.expected} 图标`, async ({
    launch,
  }, info) => {
    const instance = await launch();
    await closePicker(instance.page);
    await showLibrarySidebar(instance.page);
    await checkBrandTheme(instance.page, choice);
    await info.attach(`brand-${choice.theme}-${choice.system}`, {
      body: await instance.page.locator("[data-sidebar-brand]").screenshot(),
      contentType: "image/png",
    });
  });
}
