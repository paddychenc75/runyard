// 不在范围内的目录：不应被拦
import { dialog } from "electron";
export const c01 = <p>主进程目录里的文字</p>;
export const c02 = dialog;
export const c03 = <input aria-label="主进程目录里的属性" />; // 不在范围内：不应被插件拦
