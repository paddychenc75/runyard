// CSS Modules：esbuild 把 .module.css 打成带散列的类名，这里让 tsc 认识 import。
// 单独一个没有 import 的文件，才是全局声明（有 import 的文件是模块，里面的 declare module 只是补充）。
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.css";

// 品牌图标由 esbuild 内联，界面不依赖运行时文件路径。
declare module "*.svg" {
  const dataUrl: string;
  export default dataUrl;
}
