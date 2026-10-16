import { useT } from "@runyard/i18n/react";
import { Button, UserText } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import styles from "./TabContent.module.css";

export interface TabContentProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 项目标签页的内容区的最小版本：名字、状态，以及运行与停止。手动停止后标签页仍开着，
// 这里出现“运行”按钮，点它再次启动、持有者仍是这个标签页（规格 DESKTOP-WORKSPACE-11、12）。
// 右边的预览区是 PreviewPane；运行条、控制台、编辑器随 #176 及之后。
export function TabContent({ bridge, tab }: TabContentProps) {
  const t = useT();
  const state = tab.state === "idle" ? t("desktop.state.idle.label") : t(`runState.${tab.state}`);
  return (
    <section className={styles.root} data-tab={tab.id}>
      <h1 className={styles.title}>
        <UserText>{tab.name}</UserText>
      </h1>
      <p className={styles.state}>{state}</p>
      <Button
        size="sm"
        disabled={tab.busy}
        onClick={() => void bridge.call(tab.active ? "run.stop" : "run.start", tab.id)}
      >
        {tab.active ? t("desktop.stop.action") : t("desktop.run.action")}
      </Button>
    </section>
  );
}
