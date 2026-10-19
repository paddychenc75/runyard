import type { Bounds } from "../shared/layout.ts";

/** 单例设置窗口只管理自身生命周期，不接触主窗口或项目运行。 */
export interface SettingsWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  close(): void;
  getNormalBounds(): Bounds;
  on(event: "close" | "closed" | "moved" | "resized", listener: () => void): void;
}

interface WindowDeps<W extends SettingsWindow> {
  create: (bounds: Bounds | null) => W;
  load: () => Bounds | null;
  save: (bounds: Bounds) => void;
}

export class SettingsWindowController<W extends SettingsWindow> {
  #window: W | null = null;
  readonly #deps: WindowDeps<W>;
  constructor(deps: WindowDeps<W>) {
    this.#deps = deps;
  }

  get current(): W | null {
    return this.#window?.isDestroyed() ? null : this.#window;
  }

  open(): void {
    let window = this.current;
    if (window === null) {
      window = this.#deps.create(this.#deps.load());
      this.#window = window;
      const created = window;
      const remember = () => this.#deps.save(created.getNormalBounds());
      created.on("moved", remember);
      created.on("resized", remember);
      created.on("close", remember);
      created.on("closed", () => {
        if (this.#window === created) this.#window = null;
      });
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  close(): void {
    this.current?.close();
  }
}
