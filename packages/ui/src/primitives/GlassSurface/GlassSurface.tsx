import type { ComponentProps } from "react";
import "../../styles/materials.css";
import styles from "./GlassSurface.module.css";

/** 五种玻璃配方，对应材质规范板：工具栏胶囊、侧栏、文件树面板、对话框、菜单 */
export type GlassMaterial = "toolbar" | "sidebar" | "filetree" | "dialog" | "menu";

export interface GlassSurfaceProps extends ComponentProps<"div"> {
  /** 玻璃只用于浮层，不用于内容本身（规范板“玻璃只用在浮层”） */
  material: GlassMaterial;
}

// 材质的全部样式（背景、模糊、描边、圆角、投影）在 styles/materials.css；
// 这里只负责把 material 写成属性，所以组件里没有任何一行 backdrop-filter
export function GlassSurface({ material, className, ...rest }: GlassSurfaceProps) {
  return (
    <div
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-glass-material={material}
    />
  );
}
