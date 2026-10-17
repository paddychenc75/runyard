// 打包开关（fuse）：打包时写进 Electron 可执行文件、运行时改不了的能力开关。
// 取值的依据是技术设计 §6.5 的“打包开关”一行和决策记录 0007 第 2 条；改任何一项先改那两处。

export interface FuseSettings {
  /** 管理进程和内置命令行靠它（ELECTRON_RUN_AS_NODE）：关掉后两者都起不来，必须保持开 */
  runAsNode: boolean;
  enableCookieEncryption: boolean;
  /** NODE_OPTIONS 环境变量；不影响当作 Node 运行的管理进程和命令行 */
  enableNodeOptionsEnvironmentVariable: boolean;
  /** --inspect 一类调试参数；端到端测试（Playwright）要靠它连上 Electron，正式构建关 */
  enableNodeCliInspectArguments: boolean;
  enableEmbeddedAsarIntegrityValidation: boolean;
  onlyLoadAppFromAsar: boolean;
  loadBrowserProcessSpecificV8Snapshot: boolean;
  /** 关掉后界面不能用 file:// 读 asar，所以界面走 app://runyard/ */
  grantFileProtocolExtraPrivileges: boolean;
}

export const RELEASE_FUSES: Readonly<FuseSettings> = {
  runAsNode: true,
  enableCookieEncryption: true,
  enableNodeOptionsEnvironmentVariable: false,
  enableNodeCliInspectArguments: false,
  enableEmbeddedAsarIntegrityValidation: true,
  onlyLoadAppFromAsar: true,
  loadBrowserProcessSpecificV8Snapshot: false,
  grantFileProtocolExtraPrivileges: false,
};

/** 端到端测试用的构建：只有调试参数这一项与正式构建不同 */
export const E2E_FUSES: Readonly<FuseSettings> = {
  ...RELEASE_FUSES,
  enableNodeCliInspectArguments: true,
};

/** electron-builder 的 electronFuses 配置；改了开关的二进制要重签，所以 macOS 上永远带 resetAdHocDarwinSignature（决策记录 0007 第 1 条） */
export function electronFusesOption(settings: Readonly<FuseSettings>) {
  return { ...settings, resetAdHocDarwinSignature: true };
}
