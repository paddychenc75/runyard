import { ScrollArea } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { DesktopError, TabRow } from "../../shared/library-state.ts";
import { MissingTool } from "./MissingTool.tsx";
import styles from "./MissingToolPane.module.css";

export interface MissingToolPaneProps {
  bridge: DesktopBridge;
  tab: TabRow;
  failure: DesktopError;
}

// 脚本和服务项目缺工具时右侧整块换成缺工具画面（设计稿 MissingLight）：这两类没有页面可预览，
// 地址栏、输出区、请求面板都没有意义，也不能把上一次运行的输出当成这次的结果摆在旁边。
export function MissingToolPane({ bridge, tab, failure }: MissingToolPaneProps) {
  return (
    <section className={styles.root} data-missing-tool-pane={tab.id}>
      <ScrollArea className={styles.scroll} viewportClassName={styles.viewport}>
        <MissingTool bridge={bridge} tab={tab} failure={failure} />
      </ScrollArea>
    </section>
  );
}
