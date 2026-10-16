import { join } from "node:path";

// 桌面应用自己的数据目录（窗口位置、打开的标签页、预览的 cookie 等，技术设计 §4.2）。
// 默认的目录叫 Electron，开发和正式会共用一份，所以显式指定：正式用 Runyard，从源码运行用 Runyard-dev。
// 指定了 --root 时放进该目录下，让试验和自动检查与真实数据、与别的正在运行的窗口完全隔离
// （单实例锁也按这个目录算，所以不同 --root 的窗口互不抢锁）。

export interface UserDataInputs {
  /** 系统的应用数据根目录（app.getPath("appData")） */
  appData: string;
  packaged: boolean;
  root: string | undefined;
}

export function resolveUserDataDir(inputs: UserDataInputs): string {
  if (inputs.root !== undefined) return join(inputs.root, ".runyard", "app-data");
  return join(inputs.appData, inputs.packaged ? "Runyard" : "Runyard-dev");
}
