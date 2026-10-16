import type { BrowserWindow } from "electron";
import type { LibraryController } from "./library-controller.ts";
import type { ElectronPreviewHost } from "./preview-view.ts";

// 冒烟自检（pnpm --filter @runyard/desktop smoke）：窗口不显示，走一遍
// “新建 html 项目 → 运行 → 就绪 → 预览加载 → 停止”，成功返回 0。只在本机手动跑，不进 CI
// （CI 的 Ubuntu 没有显示环境，Windows 不在第一版范围）。

const STEP_TIMEOUT_MS = 90_000;
const POLL_MS = 200;

async function waitFor<T>(
  what: string,
  probe: () => Promise<T | undefined> | T | undefined,
): Promise<T> {
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`smoke timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

export async function runSmoke(
  controller: LibraryController,
  window: BrowserWindow,
  preview: ElectronPreviewHost,
  log: (line: string) => void,
): Promise<number> {
  try {
    await controller.create("html");
    const created = await waitFor("a playground", () => controller.getState().playgrounds[0]);
    log(`created ${created.name}`);
    await controller.openProject(created.id);
    await waitFor("ready", () =>
      controller.getState().playgrounds.find((row) => row.id === created.id)?.state === "ready"
        ? true
        : undefined,
    );
    log("run is ready");
    const url = await waitFor("preview", () => {
      const current = preview.currentUrl();
      return current?.startsWith("http://127.0.0.1:") ? current : undefined;
    });
    log(`preview loaded ${url}`);
    // 视图要摆在界面占位区的位置上（占位区实测后经 preview.bounds 报来）
    const slot = await waitFor("the preview slot", async () => {
      const rect = (await window.webContents.executeJavaScript(
        `(() => { const r = document.querySelector("[data-preview-slot]")?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null; })()`,
      )) as { x: number; y: number; width: number; height: number } | null;
      const placed = preview.currentBounds();
      return rect !== null &&
        placed !== undefined &&
        JSON.stringify(rect) === JSON.stringify(placed)
        ? rect
        : undefined;
    });
    log(`preview view sits on the slot ${JSON.stringify(slot)}`);
    const text = (await window.webContents.executeJavaScript("document.body.innerText")) as string;
    log(`window text: ${text.replaceAll("\n", " | ")}`);
    await controller.stopRun(created.id);
    await waitFor("stopped", () =>
      controller.getState().playgrounds.find((row) => row.id === created.id)?.active === false
        ? true
        : undefined,
    );
    log("SMOKE OK");
    return 0;
  } catch (error) {
    log(`SMOKE FAILED ${String(error)}`);
    return 1;
  }
}
