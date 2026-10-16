import type { Bounds } from "../../shared/layout.ts";

// 浮层计数器（技术设计 §6.7）：每个菜单、弹窗、下拉打开时 acquire、关闭时调返回的函数，
// 并报出自己的矩形；外壳订阅它，发现有浮层与预览占位重叠就让预览让位。
// 预览是原生视图，永远盖在界面之上，所以不能靠 z-index 解决。

export class OverlayCounter {
  #next = 0;
  readonly #open = new Map<number, Bounds | undefined>();
  readonly #listeners = new Set<() => void>();

  /** 浮层打开；矩形未知时（不传）按“会盖住预览”处理。返回关闭函数，重复调用无害 */
  acquire(rect?: Bounds): () => void {
    const id = this.#next++;
    this.#open.set(id, rect);
    this.#notify();
    return () => {
      if (this.#open.delete(id)) this.#notify();
    };
  }

  /** 是否有浮层盖住这块区域 */
  covers(area: Bounds | null): boolean {
    for (const rect of this.#open.values()) {
      if (rect === undefined || area === null || intersects(rect, area)) return true;
    }
    return false;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

function intersects(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
