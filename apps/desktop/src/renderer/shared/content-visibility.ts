import { createContext, useContext } from "react";

/** 页面暂时隐藏时保留编辑器和终端实例，但撤销其全局输入与原生视图。 */
export const ContentVisibility = createContext(true);
export const useContentVisible = () => useContext(ContentVisibility);
