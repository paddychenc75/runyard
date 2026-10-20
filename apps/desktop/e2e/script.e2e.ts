import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWithKeyboard, expect, test } from "./support/fixtures.ts";

test("[DESKTOP-WORKSPACE-69][DESKTOP-WORKSPACE-70][DESKTOP-TERMINAL-39][DESKTOP-TERMINAL-40] 脚本项目：创建后自动运行出输出，再运行一个读标准输入的程序并从输入框发送一行", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page } = runyard;
  await createWithKeyboard(page, "Node + TypeScript");
  const output = page.getByRole("region", { name: "Process output" });
  await expect(output.getByRole("log")).toContainText("Hello, Runyard!");
  await expect(output).toContainText("exit code 0");
  const bottom = page.locator("[data-console]");
  await expect(bottom.getByRole("log")).toHaveCount(0);
  await expect(bottom.getByRole("button", { name: "Clear", exact: true })).toHaveCount(0);
  await expect(bottom.locator("[data-terminal-host]")).toHaveCount(0);
  const project = await bottom.getAttribute("data-console");
  expect(project).toBeTruthy();
  expect(await runyard.call("terminal.status", { project })).toMatchObject({ open: false });
  const openTerminal = bottom.getByRole("button", {
    name: "Click here or press ⌃` to open a terminal",
  });
  await expect(openTerminal).toBeVisible();

  // 换成一个常驻、回显标准输入的程序；先关掉“保存即运行”，免得外部改文件触发的那次运行和手动运行抢
  await output.getByRole("switch", { name: "Run on save" }).click();
  writeFileSync(
    join(runyard.library, "node-ts-1", "main.ts"),
    'console.log("echo-ready");\nprocess.stdin.setEncoding("utf8");\nprocess.stdin.on("data", (chunk: string) => console.log("got:" + chunk.trim()));\n',
  );
  await output.getByRole("button", { name: "Run" }).click();
  await expect(output.getByRole("log")).toContainText("echo-ready");

  const input = output.getByRole("textbox", { name: "Input for the program" });
  await expect(input).toBeEnabled();
  await input.fill("hello-from-e2e");
  await input.press("Enter");
  await expect(output.getByRole("log")).toContainText("got:hello-from-e2e");
  await output.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(output.getByRole("log")).not.toContainText("got:hello-from-e2e");
  await input.fill("after-clear");
  await input.press("Enter");
  await expect(output.getByRole("log")).toContainText("got:after-clear");
  await expect(bottom.getByRole("log")).toHaveCount(0);
  await openTerminal.click();
  await expect(bottom.locator("[data-terminal-host]")).toBeVisible();
  await expect
    .poll(() => runyard.call("terminal.status", { project }), { timeout: 1000 })
    .toMatchObject({ open: true });
  await expect
    .poll(
      async () => (await runyard.call<{ output: string }>("terminal.attach", { project })).output,
    )
    .not.toBe("");
  await runyard.call("terminal.write", { project, data: "pwd\r" });
  await expect
    .poll(
      async () => (await runyard.call<{ output: string }>("terminal.attach", { project })).output,
    )
    .toContain(join(runyard.library, "node-ts-1"));
});
