import { Popover } from "@base-ui/react/popover";
import type { Localized } from "@runyard/i18n";
import type { ReactElement, ReactNode } from "react";
import { Button } from "../../primitives/Button/index.ts";
import { GlassSurface } from "../../primitives/GlassSurface/index.ts";
import { ScrollArea } from "../../primitives/ScrollArea/index.ts";
import styles from "./NoticeList.module.css";

export interface NoticeListProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  title: Localized;
  clearLabel: Localized;
  requiredLabel: Localized;
  recentLabel: Localized;
  emptyLabel: Localized;
  required: ReactNode;
  recent: ReactNode;
  hasRecent: boolean;
  onClear: () => void;
  container?: HTMLElement | null;
}
export function NoticeList({
  open,
  onOpenChange,
  trigger,
  title,
  clearLabel,
  requiredLabel,
  recentLabel,
  emptyLabel,
  required,
  recent,
  hasRecent,
  onClear,
  container,
}: NoticeListProps) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal container={container}>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className={styles.positioner}>
          <Popover.Popup render={<GlassSurface material="menu" />} className={styles.root}>
            <div className={styles.header}>
              <Popover.Title className={styles.title}>{title}</Popover.Title>
              <Button
                className={styles.clear}
                size="sm"
                variant="neutral"
                disabled={!hasRecent}
                onClick={onClear}
              >
                {clearLabel}
              </Button>
            </div>
            <ScrollArea className={styles.scroll} viewportClassName={styles.viewport}>
              <section className={styles.group}>
                <h3>{requiredLabel}</h3>
                {required ?? <p className={styles.empty}>{emptyLabel}</p>}
              </section>
              <section className={styles.group}>
                <h3>{recentLabel}</h3>
                {recent ?? <p className={styles.empty}>{emptyLabel}</p>}
              </section>
            </ScrollArea>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
