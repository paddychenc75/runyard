import type { WorkbenchParams } from "./params.ts";

// 把参数写到 <html>：和应用的启动做法一致（预加载脚本在页面脚本运行前写 data-theme、lang、data-platform），
// 所以 main.tsx 在第一次渲染之前就调用它，不然第一帧按系统主题画、随后过渡到所选主题。
// 组件在工作台里看到的就是它在应用里会看到的（技术设计 §6.7“设计变量怎么来、怎么用”）。
export function applyToDocument(params: WorkbenchParams): void {
  const root = document.documentElement;
  if (params.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", params.theme);
  root.setAttribute("lang", params.locale);
  root.setAttribute("data-platform", params.platform);
}
