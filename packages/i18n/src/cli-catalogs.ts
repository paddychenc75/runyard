import enErrors from "../locales/en/errors.json" with { type: "json" };
import enFormat from "../locales/en/format.json" with { type: "json" };
import enNotice from "../locales/en/notice.json" with { type: "json" };
import enPlatform from "../locales/en/platform.json" with { type: "json" };
import enRunState from "../locales/en/runState.json" with { type: "json" };
import zhErrors from "../locales/zh-CN/errors.json" with { type: "json" };
import zhFormat from "../locales/zh-CN/format.json" with { type: "json" };
import zhNotice from "../locales/zh-CN/notice.json" with { type: "json" };
import zhPlatform from "../locales/zh-CN/platform.json" with { type: "json" };
import zhRunState from "../locales/zh-CN/runState.json" with { type: "json" };
import type { Catalog } from "./create-translator.ts";

// 命令行打包的文案组（技术设计 §6.8“包和谁能用它”）：errors、notice、runState、platform、format。
// 两种语言都打进去，运行时按语言选；`cli` 组（命令说明、--help）随命令的 issue 加进这个列表。
export const cliCatalogs: readonly Catalog[] = [
  { en: enErrors, "zh-CN": zhErrors },
  { en: enNotice, "zh-CN": zhNotice },
  { en: enRunState, "zh-CN": zhRunState },
  { en: enPlatform, "zh-CN": zhPlatform },
  { en: enFormat, "zh-CN": zhFormat },
];
