// 已知缺口：同一条规则被两个 override 命中时，后一个的 options 整体覆盖前一个（不合并），所以下面这行 electron 导入漏掉了
import { app } from "electron"; // BAD-GAP imports
import { f } from "../features/f.ts"; // BAD imports
export const x = [app, f];
