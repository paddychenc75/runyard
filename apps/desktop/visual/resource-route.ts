import type { Page } from "@playwright/test";
import { resourceTarget } from "./resource-policy.ts";

/** 诊断和CI共用同一闸门；本地脚本返回真实构建内容，未知请求必须留下失败证据。 */
export async function installResourceRoute(
  page: Page,
  server: { url: string; assets: ReadonlySet<string> },
  errors: string[],
) {
  await page.route("**/*", async (route) => {
    const requested = route.request().url();
    const target = resourceTarget(requested, server.url, server.assets);
    if (target === null) {
      errors.push(`画面工作台拒绝未登记资源：${requested}`);
      await route.abort();
    } else if (target === requested) await route.continue();
    else {
      const response = await route.fetch({ url: target, maxRedirects: 0 });
      if (!response.ok()) {
        errors.push(`本地资源读取失败：${requested}（${response.status()}）`);
        await route.abort();
      } else await route.fulfill({ response });
    }
  });
}
