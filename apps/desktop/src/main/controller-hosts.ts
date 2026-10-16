import type { Bounds } from "../shared/layout.ts";

// 控制器对外面的两个依赖（接口）：预览视图的宿主和系统层动作。真实的在 Electron 接线里，测试里换假的。

/** 预览视图的宿主。同一个项目、同一个地址再次 show 时应当什么都不做 */
export interface PreviewHost {
  show(playgroundId: string, url: string): void;
  /** 藏起当前预览但保留视图（切到资源库或别的标签） */
  hide(): void;
  /** 销毁这个项目的预览视图（标签被去掉、或页面没了/不再就绪） */
  release(playgroundId: string): void;
  /** 占位区的位置；null 是占位区不在了 */
  setBounds(bounds: Bounds | null): void;
  /** 截当前预览的一帧；没有预览是 null */
  capture(): Promise<string | null>;
  setVisible(visible: boolean): void;
}

/** 系统层的两个动作（Electron 的 shell 和剪贴板在 integration/system-actions.ts，这里不认识 Electron） */
export interface SystemActions {
  /** 在文件管理器里选中这个路径 */
  revealInFileManager(path: string): void;
  copyText(text: string): void;
  /** 用系统浏览器打开链接；调用前已确认是 https */
  openExternal(url: string): void;
}
