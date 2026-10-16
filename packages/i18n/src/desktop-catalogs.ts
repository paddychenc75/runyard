import enDesktop from "../locales/en/desktop.json" with { type: "json" };
import enErrors from "../locales/en/errors.json" with { type: "json" };
import enFormat from "../locales/en/format.json" with { type: "json" };
import enLibrary from "../locales/en/library.json" with { type: "json" };
import enNotice from "../locales/en/notice.json" with { type: "json" };
import enPlatform from "../locales/en/platform.json" with { type: "json" };
import enRunState from "../locales/en/runState.json" with { type: "json" };
import enWorkspace from "../locales/en/workspace.json" with { type: "json" };
import zhDesktop from "../locales/zh-CN/desktop.json" with { type: "json" };
import zhErrors from "../locales/zh-CN/errors.json" with { type: "json" };
import zhFormat from "../locales/zh-CN/format.json" with { type: "json" };
import zhLibrary from "../locales/zh-CN/library.json" with { type: "json" };
import zhNotice from "../locales/zh-CN/notice.json" with { type: "json" };
import zhPlatform from "../locales/zh-CN/platform.json" with { type: "json" };
import zhRunState from "../locales/zh-CN/runState.json" with { type: "json" };
import zhWorkspace from "../locales/zh-CN/workspace.json" with { type: "json" };
import type { Catalog } from "./create-translator.ts";

// 桌面应用打包的文案组：desktop、library、workspace、errors、notice、runState、platform、format。
// format 是 useFormat() 的相对时间和时长要用的。create、ui 等其余的组随第一个用到它们的
// 界面改动一起加（i18n-unused 不许有没人引用的键，所以不能先建空壳）。
export const desktopCatalogs: readonly Catalog[] = [
  { en: enDesktop, "zh-CN": zhDesktop },
  { en: enErrors, "zh-CN": zhErrors },
  { en: enFormat, "zh-CN": zhFormat },
  { en: enLibrary, "zh-CN": zhLibrary },
  { en: enNotice, "zh-CN": zhNotice },
  { en: enRunState, "zh-CN": zhRunState },
  { en: enPlatform, "zh-CN": zhPlatform },
  { en: enWorkspace, "zh-CN": zhWorkspace },
];
