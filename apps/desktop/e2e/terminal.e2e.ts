import { randomUUID } from "node:crypto";
import { createWithKeyboard, expect, test } from "./support/fixtures.ts";

test("终端：运行命令看到输出；有命令在跑时关标签页会问，取消后还在，确认后命令一起结束", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page } = runyard;
  // 给长命令带一个独有的环境变量，之后按它在整台机器上找，不靠进程名（用 node 而不是 sleep：系统自带的程序读不到环境）
  const mark = { name: "RYE_SLEEP_MARK", value: randomUUID() };
  const sleeperAlive = async (): Promise<boolean> =>
    (await runyard.platform.proc.findByMarker(mark)).length > 0;
  await createWithKeyboard(page);
  await expect(page.getByRole("group", { name: "Run bar" })).toContainText(/Running :\d+/);

  await page.getByRole("button", { name: "Terminal" }).click();
  const terminal = page.locator(".xterm").first();
  await expect(terminal).toBeVisible();
  await terminal.click();
  // 外壳刚起来时敲的字会被丢掉：同一条命令隔一秒重发，直到看到输出（等号两边的算式保证只认命令的输出，不认回显）
  await expect
    .poll(
      async () => {
        await page.keyboard.type("echo e2e-term-$((20+22))");
        await page.keyboard.press("Enter");
        return terminal.innerText();
      },
      { intervals: [1000], timeout: 30_000 },
    )
    .toMatch(/^e2e-term-42$/m);

  await page.keyboard.type(
    `${mark.name}=${mark.value} ${process.execPath} -e "setTimeout(() => {}, 4242000)"`,
  );
  await page.keyboard.press("Enter");
  await expect.poll(sleeperAlive).toBe(true);

  await page.getByRole("button", { name: "Close html-1" }).click();
  const ask = page.getByRole("alertdialog", { name: "Close html-1 and stop it?" });
  await expect(ask).toContainText("node still running in the terminal");
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("tab", { name: /html-1/ })).toBeVisible();
  expect(await sleeperAlive()).toBe(true);

  await page.getByRole("button", { name: "Close html-1" }).click();
  await page.getByRole("button", { name: "Close and stop" }).click();
  await expect(page.getByRole("tab", { name: /html-1/ })).toHaveCount(0);
  await expect.poll(sleeperAlive, { timeout: 10_000 }).toBe(false);
});
