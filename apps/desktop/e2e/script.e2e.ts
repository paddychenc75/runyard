import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWithKeyboard, expect, test } from "./support/fixtures.ts";

test("脚本项目：创建后自动运行出输出，再运行一个读标准输入的程序并从输入框发送一行", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page } = runyard;
  await createWithKeyboard(page, "Node + TypeScript");
  const output = page.getByRole("region", { name: "Process output" });
  await expect(output.getByRole("log")).toContainText("Hello, Runyard!");
  await expect(output).toContainText("exit code 0");

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
});
