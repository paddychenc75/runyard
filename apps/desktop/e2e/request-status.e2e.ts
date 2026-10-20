import { expect, test } from "./support/fixtures.ts";

for (const lang of ["en", "zh-CN"] as const) {
  test(`[DESKTOP-REQUEST-PANEL-06] ${lang}：停止后的响应有明确提示，280宽工具栏不换行`, async ({
    launch,
  }, testInfo) => {
    const app = await launch({ lang });
    const { page } = app;
    await expect(page.getByRole("combobox")).toBeFocused();
    await page.keyboard.press("Escape");
    await app.cli("new", "hono", "request-review");
    let id: string | undefined;
    await expect
      .poll(async () => {
        const state = await app.call<{ playgrounds: { id: string; name: string }[] }>(
          "library.get",
        );
        id = state.playgrounds.find((item) => item.name === "request-review")?.id;
        return id;
      })
      .toBeTruthy();
    await app.call("tab.open", id);
    const panel = page.locator("[data-request-panel]");
    const send = panel.getByRole("button", { name: lang === "en" ? "Send" : "发送", exact: true });
    await expect(send).toBeEnabled();
    await send.click();
    await expect(panel).toContainText("200 OK");
    const resize = page.getByRole("separator", {
      name: lang === "en" ? "Resize preview" : "调整预览宽度",
    });
    await resize.focus();
    let current = Number(await resize.getAttribute("aria-valuenow"));
    while (current > 280) {
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(async () => Number(await resize.getAttribute("aria-valuenow")))
        .toBeLessThan(current);
      current = Number(await resize.getAttribute("aria-valuenow"));
    }
    await expect.poll(async () => Math.round((await panel.boundingBox())?.width ?? 0)).toBe(280);
    const address = await panel.locator("form label").evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
      input: element.querySelector("input")?.getBoundingClientRect().width ?? 0,
    }));
    expect(address.scroll).toBeLessThanOrEqual(address.width);
    expect(address.input).toBeGreaterThanOrEqual(40);
    const tools = panel.locator("[data-request-tools]");
    const geometry = await tools.evaluate((row) => ({
      width: row.clientWidth,
      scroll: row.scrollWidth,
      centers: [...row.querySelectorAll("button")].map((button) => {
        const box = button.getBoundingClientRect();
        return box.y + box.height / 2;
      }),
    }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    expect(Math.max(...geometry.centers) - Math.min(...geometry.centers)).toBeLessThanOrEqual(1);
    await app.call("run.stop", id);
    await expect(send).toBeDisabled();
    await expect(panel.locator('[data-stale="true"]')).toBeVisible();
    await expect(panel).toContainText(
      lang === "en" ? "This response was received before it stopped" : "这是停止前的响应",
    );
    await expect(panel).toContainText("200 OK");
    await page.screenshot({
      path: testInfo.outputPath(`${lang}-narrow-stopped.png`),
      scale: "css",
    });
  });
}
