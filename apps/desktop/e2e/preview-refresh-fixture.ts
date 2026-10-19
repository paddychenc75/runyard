import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, previewText } from "./support/fixtures.ts";
import type { RunyardApp } from "./support/launch.ts";

/** 用真实静态项目承载可观察的页面内状态，刷新后必须重新执行脚本。 */
export async function openRefreshFixture(instance: RunyardApp) {
  const picker = instance.page.getByRole("dialog").getByRole("combobox");
  await expect(picker).toBeFocused();
  await picker.press("Escape");
  await expect(instance.page.getByRole("dialog")).toHaveCount(0);
  await instance.cli("new", "html", "refresh-counter");
  writeFileSync(
    join(instance.library, "refresh-counter", "index.html"),
    `<!doctype html><meta charset="utf-8"><style>body{font:16px system-ui;padding:32px;background:white;color:#111}button{padding:8px 16px}</style>
    <h1>Refresh counter</h1><p>Reload resets the counter.</p><button id="counter">Clicked 0 times</button>
    <script>let count=0;document.querySelector('#counter').onclick=()=>{document.querySelector('#counter').textContent='Clicked '+(++count)+' times';};</script>`,
  );
  // CLI 创建完成后，桌面端仍要异步接收资源库变更；等真实状态传播，不能立刻读取一次。
  const projectId = async () => {
    const state = await instance.call<{ playgrounds: { id: string; name: string }[] }>(
      "library.get",
    );
    return state.playgrounds.find((item) => item.name === "refresh-counter")?.id;
  };
  await expect.poll(projectId).toBeDefined();
  await instance.call("tab.open", await projectId());
  await expect.poll(() => previewText(instance.app)).toContain("Clicked 0 times");
}

export async function incrementPreview(instance: RunyardApp) {
  await instance.app.evaluate(async ({ webContents }) => {
    const preview = webContents
      .getAllWebContents()
      .find((item) => item.getURL().startsWith("http://127.0.0.1:"));
    if (!preview) throw new Error("找不到测试项目的预览");
    await preview.executeJavaScript("document.querySelector('#counter').click()");
  });
  await expect.poll(() => previewText(instance.app)).toContain("Clicked 1 times");
}

/** 挂起真实预览的下一次主文档请求；由测试明确放行或制造网络失败，不用固定睡眠。 */
export async function holdPreviewRequest(instance: RunyardApp) {
  await instance.app.evaluate(({ webContents }) => {
    const preview = webContents
      .getAllWebContents()
      .find((item) => item.getURL().startsWith("http://127.0.0.1:"));
    if (!preview) throw new Error("找不到测试项目的预览");
    const state = globalThis as unknown as { refreshRequest?: (cancel: boolean) => void };
    preview.session.webRequest.onBeforeRequest(
      { urls: ["http://127.0.0.1:*/*"] },
      (details, callback) => {
        if (details.resourceType !== "mainFrame") return callback({});
        state.refreshRequest = (cancel) => {
          callback({ cancel });
          delete state.refreshRequest;
        };
      },
    );
  });
}

export async function releasePreviewRequest(instance: RunyardApp, cancel = false) {
  await expect
    .poll(() =>
      instance.app.evaluate(
        () => typeof (globalThis as unknown as { refreshRequest?: unknown }).refreshRequest,
      ),
    )
    .toBe("function");
  await instance.app.evaluate(({ webContents }, shouldCancel) => {
    const state = globalThis as unknown as { refreshRequest?: (cancel: boolean) => void };
    state.refreshRequest?.(shouldCancel);
    for (const contents of webContents.getAllWebContents()) {
      if (contents.getURL().startsWith("http://127.0.0.1:"))
        contents.session.webRequest.onBeforeRequest(null);
    }
  }, cancel);
}
