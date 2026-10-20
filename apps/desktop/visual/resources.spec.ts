import { expect, test } from "./fixtures.ts";
import { installResourceRoute } from "./resource-route.ts";

test("工作区加载真实本地Monaco和中文资源，不以空脚本代替或访问外部网络", async ({
  page,
  screenServer,
}) => {
  const errors: string[] = [];
  const requested: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requested.push(request.url()));
  await installResourceRoute(page, screenServer, errors);
  await page.goto(`${screenServer.url}?scene=Web&locale=zh-CN`);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const runtime = await (
          window as unknown as {
            __runyardEditorRuntime?: Promise<{
              monaco: { languages: { getLanguages(): { id: string }[] } };
            }>;
          }
        ).__runyardEditorRuntime;
        return runtime?.monaco.languages.getLanguages().some((item) => item.id === "vue") ?? false;
      }),
    )
    .toBe(true);
  expect(requested).toContain("app://runyard/editor/editor.js");
  expect(requested).toContain("app://runyard/editor/editor.css");
  expect(requested).toContain("app://runyard/editor/nls-zh-cn.js");
  expect(errors).toEqual([]);
});
