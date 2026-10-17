import { type BrowserWindow, shell, WebContentsView } from "electron";
import type { Bounds } from "../shared/layout.ts";
import type { PreviewHost } from "./library-controller.ts";
import {
  createNavigationGuards,
  isLocalPreviewUrl,
  isPermissionAllowed,
} from "./preview-policy.ts";

// 预览：每个有页面的标签页一个 WebContentsView，摆在界面占位区上面（技术设计 §6.1、§6.5）。
// 隔离：沙箱、没有预加载脚本、没有 Node，每个项目一个独立的内存存储分区，权限默认拒绝。
// 位置不在这里算：界面的占位区（PreviewSlot）量出自己的矩形报来，视图就摆在那里。

interface Entry {
  view: WebContentsView;
  url: string;
}

export class ElectronPreviewHost implements PreviewHost {
  readonly #window: BrowserWindow;
  readonly #views = new Map<string, Entry>();
  /** 此刻摆在窗口里的那个视图的项目 id */
  #current: string | undefined;
  #bounds: Bounds | null = null;
  #visible = true;

  constructor(window: BrowserWindow) {
    this.#window = window;
  }

  show(playgroundId: string, url: string): void {
    if (!isLocalPreviewUrl(url)) {
      this.release(playgroundId);
      return;
    }
    if (this.#current !== undefined && this.#current !== playgroundId) this.#detach();
    let entry = this.#views.get(playgroundId);
    if (entry !== undefined && entry.url !== url) {
      // 重新运行后端口换了：旧视图丢掉重建，不在同一个视图里跳转
      this.release(playgroundId);
      entry = undefined;
    }
    if (entry === undefined) {
      entry = { view: this.#createView(playgroundId), url };
      this.#views.set(playgroundId, entry);
      void entry.view.webContents.loadURL(url);
    }
    if (this.#current !== playgroundId) {
      this.#window.contentView.addChildView(entry.view);
      this.#current = playgroundId;
    }
    this.#apply();
  }

  hide(): void {
    this.#detach();
  }

  release(playgroundId: string): void {
    const entry = this.#views.get(playgroundId);
    if (entry === undefined) return;
    if (this.#current === playgroundId) this.#detach();
    this.#views.delete(playgroundId);
    entry.view.webContents.close();
  }

  setBounds(bounds: Bounds | null): void {
    this.#bounds = bounds === null ? null : roundBounds(bounds);
    this.#apply();
  }

  async capture(): Promise<string | null> {
    const view = this.#currentView();
    if (view === undefined) return null;
    try {
      const image = await view.webContents.capturePage();
      return image.isEmpty() ? null : image.toDataURL();
    } catch {
      // 窗口藏着或最小化时截不到画面；没有帧就不换截图，调用方照常处理
      return null;
    }
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    this.#apply();
  }

  reload(playgroundId: string): void {
    this.#views.get(playgroundId)?.view.webContents.reload();
  }

  openDevTools(playgroundId: string): void {
    // 分离的窗口：开发者工具不挤占预览区，也不会落到应用界面的 webContents 上
    this.#views.get(playgroundId)?.view.webContents.openDevTools({ mode: "detach" });
  }

  /** 预览此刻真正加载着的地址：不给项目就是摆在窗口里的那个（冒烟自检用） */
  currentUrl(playgroundId?: string): string | undefined {
    const view =
      playgroundId === undefined ? this.#currentView() : this.#views.get(playgroundId)?.view;
    return view?.webContents.getURL();
  }

  /** 预览视图此刻的位置（冒烟自检用）；没有预览是 undefined */
  currentBounds(): Bounds | undefined {
    return this.#currentView()?.getBounds();
  }

  #currentView(): WebContentsView | undefined {
    return this.#current === undefined ? undefined : this.#views.get(this.#current)?.view;
  }

  #detach(): void {
    const view = this.#currentView();
    if (view !== undefined) this.#window.contentView.removeChildView(view);
    this.#current = undefined;
  }

  #apply(): void {
    const view = this.#currentView();
    if (view === undefined) return;
    // 占位区还没报位置、或浮层要盖住它时，视图藏起来（占位区显示截来的那一帧）
    if (this.#bounds !== null) view.setBounds(this.#bounds);
    view.setVisible(this.#visible && this.#bounds !== null);
  }

  #createView(playgroundId: string): WebContentsView {
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
    const guards = createNavigationGuards((address) => void shell.openExternal(address));
    contents.on("will-navigate", (event, target) => {
      if (!guards.onWillNavigate(target)) event.preventDefault();
    });
    contents.on("will-redirect", (event, target) => {
      if (!guards.onWillRedirect(target)) event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url: target }) => guards.onWindowOpen(target));
    return view;
  }
}

function roundBounds(bounds: Bounds): Bounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  };
}
