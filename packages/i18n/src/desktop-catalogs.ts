import enDesktop from "../locales/en/desktop.json" with { type: "json" };
import enErrors from "../locales/en/errors.json" with { type: "json" };
import enNotice from "../locales/en/notice.json" with { type: "json" };
import enPlatform from "../locales/en/platform.json" with { type: "json" };
import enRunState from "../locales/en/runState.json" with { type: "json" };
import zhDesktop from "../locales/zh-CN/desktop.json" with { type: "json" };
import zhErrors from "../locales/zh-CN/errors.json" with { type: "json" };
import zhNotice from "../locales/zh-CN/notice.json" with { type: "json" };
import zhPlatform from "../locales/zh-CN/platform.json" with { type: "json" };
import zhRunState from "../locales/zh-CN/runState.json" with { type: "json" };
import type { Catalog } from "./create-translator.ts";

// 桌面应用打包的文案组：desktop、errors、notice、runState、platform。
// 界面的 React 绑定和更多文案组随 M2 的界面包加入；现在只有最早的外壳用到的这几组。
export const desktopCatalogs: readonly Catalog[] = [
  { en: enDesktop, "zh-CN": zhDesktop },
  { en: enErrors, "zh-CN": zhErrors },
  { en: enNotice, "zh-CN": zhNotice },
  { en: enRunState, "zh-CN": zhRunState },
  { en: enPlatform, "zh-CN": zhPlatform },
];
