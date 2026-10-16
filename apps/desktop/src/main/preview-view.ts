import { type BrowserWindow, shell, WebContentsView } from "electron";
import { previewBounds } from "../shared/layout.ts";
import type { PreviewHost } from "./library-controller.ts";
import { isLocalPreviewUrl, isPermissionAllowed } from "./preview-policy.ts";

// 预览：一个项目一个 WebContentsView，摆在窗口右侧（技术设计 §6.1、§6.5）。
// 隔离：沙箱、没有预加载脚本、没有 Node，每个项目一个独立的内存存储分区，权限默认拒绝。

export class ElectronPreviewHost implements PreviewHost {
  readonly #window: BrowserWindow;
  #view: WebContentsView | undefined;
  #shown: { id: string; url: string } | undefined;

  constructor(window: BrowserWindow) {
    this.#window = window;
    window.on("resize", () => this.#layout());
  }

  show(playgroundId: string, url: string): void {
    if (this.#shown?.id === playgroundId && this.#shown.url === url) return;
    this.hide();
    if (!isLocalPreviewUrl(url)) return;
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // 没有 persist: 前缀的分区只在内存里，项目之间的 cookie 和 localStorage 互不相通
        partition: `preview-${playgroundId}`,
      },
    });
    const contents = view.webContents;
    contents.session.setPermissionRequestHandler((_contents, permission, callback) =>
      callback(isPermissionAllowed(permission)),
    );
    contents.session.setPermissionCheckHandler((_contents, permission) =>
      isPermissionAllowed(permission),
    );
    // 只放行本机地址；其他网页链接交给系统浏览器，别的协议一律拦下
    contents.on("will-navigate", (event, target) => {
      if (!isLocalPreviewUrl(target)) event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url: target }) => {
      if (target.startsWith("https://") || target.startsWith("http://")) {
        if (!isLocalPreviewUrl(target)) void shell.openExternal(target);
      }
      return { action: "deny" };
    });
    this.#view = view;
    this.#shown = { id: playgroundId, url };
    this.#window.contentView.addChildView(view);
    this.#layout();
    void contents.loadURL(url);
  }

  /** 预览此刻真正加载着的地址（冒烟自检用） */
  currentUrl(): string | undefined {
    return this.#view?.webContents.getURL();
  }

  hide(): void {
    const view = this.#view;
    if (view === undefined) return;
    this.#window.contentView.removeChildView(view);
    view.webContents.close();
    this.#view = undefined;
    this.#shown = undefined;
  }

  #layout(): void {
    if (this.#view === undefined) return;
    const [width = 0, height = 0] = this.#window.getContentSize();
    this.#view.setBounds(previewBounds({ width, height }));
  }
}
