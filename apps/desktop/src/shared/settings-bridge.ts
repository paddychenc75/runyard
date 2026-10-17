import type { Settings, SettingsPatch } from "@runyard/protocol";

// 设置页对界面暴露的类型（规格 desktop/settings）。设置本身的形状在协议包，这里只有设置页多出来的几个动作。

/** 本机找到的外部编辑器；id 存进设置的 externalEditor，name 是它自己的名字（不翻译） */
export interface ExternalEditorOption {
  id: string;
  name: string;
}

/** 用户在文件夹选择器里选的新资源库位置 */
export interface LibraryRootChoice {
  /** 绝对路径，写进设置的就是它 */
  path: string;
  /** 主目录缩成 ~ 的写法，给确认框显示 */
  display: string;
  /** 在“桌面”“文档”“下载”之内：改之前要先警告会触发系统的隐私权限弹窗 */
  protectedFolder: boolean;
}

export interface SettingsMethods {
  "settings.get": { param: undefined; result: Settings };
  /** 只传要改的字段；返回改后的全部设置。不合法的值主进程拒绝（返回改之前的设置） */
  "settings.set": { param: SettingsPatch; result: Settings };
  /** 本机找到的外部编辑器，按固定顺序 */
  "settings.editors": { param: undefined; result: ExternalEditorOption[] };
  /** 弹出文件夹选择器；取消是 null */
  "settings.pickLibraryRoot": { param: undefined; result: LibraryRootChoice | null };
  /** 在访达里显示当前资源库文件夹 */
  "settings.revealLibraryRoot": { param: undefined; result: undefined };
  /** 用设置里的外部编辑器打开项目文件夹；没选编辑器时用系统默认打开 */
  "playground.openInEditor": { param: string; result: undefined };
}
export type SettingsMethod = keyof SettingsMethods;

export const settingsMethodNames: readonly SettingsMethod[] = [
  "settings.get",
  "settings.set",
  "settings.editors",
  "settings.pickLibraryRoot",
  "settings.revealLibraryRoot",
  "playground.openInEditor",
];
