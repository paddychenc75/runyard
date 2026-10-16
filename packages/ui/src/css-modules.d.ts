// CSS Modules 的类型：类名映射。esbuild（工作台）和 Vitest 各自处理，这里只让 tsc 认识 import。
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.css";
