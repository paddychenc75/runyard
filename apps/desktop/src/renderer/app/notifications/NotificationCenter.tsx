import type { Localized, MessageKey, MessageValues, Translate } from "@runyard/i18n";
import { useFormat, useT } from "@runyard/i18n/react";
import { Button, ButtonGroup, Icon, IconButton, NoticeCard, NoticeList, Toast } from "@runyard/ui";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Bounds } from "../../../shared/layout.ts";
import { useOverlay } from "../../shared/overlay-context.tsx";
import styles from "./NotificationCenter.module.css";
import { getNotificationService, type NotificationService } from "./notification-service.ts";
import type { NotificationRecord, NotificationText } from "./notification-store.ts";

// 存储层只接受已有文案键和纯数据参数；翻译发生在当前语言的渲染期间。
function translate(t: Translate, text: NotificationText): Localized {
  return (t as (key: MessageKey, values?: MessageValues) => Localized)(text.key, text.values);
}
export function NotificationCenter({
  service = getNotificationService(),
}: {
  service?: NotificationService;
}) {
  const t = useT();
  const format = useFormat();
  const state = useSyncExternalStore(service.store.subscribe, service.store.snapshot);
  const toast = useSyncExternalStore(service.subscribeToast, service.getToast);
  const [open, setOpen] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<Bounds>();
  const records = [...state.required, ...state.recent];
  const cards = state.cards.flatMap((id) => records.filter((item) => item.id === id));
  useEffect(() => {
    const timer = setInterval(() => service.store.prune(), 60_000);
    return () => clearInterval(timer);
  }, [service]);
  useLayoutEffect(() => {
    const element = region.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [state.cards.length, open, toast]);
  useOverlay(open);
  useOverlay(!open && cards.length > 0, bounds);
  useOverlay(toast !== null);
  return (
    <>
      <NoticeList
        open={open}
        onOpenChange={setOpen}
        title={t("desktop.notifications.title")}
        clearLabel={t("desktop.notifications.clear.action")}
        requiredLabel={t("desktop.notifications.required.label")}
        recentLabel={t("desktop.notifications.recent.label")}
        emptyLabel={t("desktop.notifications.empty.label")}
        hasRecent={state.recent.length > 0}
        onClear={() => service.store.clearRecent()}
        trigger={
          <IconButton
            className={styles.trigger}
            icon="bell"
            label={t("desktop.notifications.title")}
            data-notifications-toggle=""
            data-count={
              state.required.length === 0 ? undefined : format.number(state.required.length)
            }
            variant={open ? "neutral" : "ghost"}
          />
        }
        required={
          state.required.length === 0
            ? null
            : state.required.map((item) => <Entry key={item.id} item={item} service={service} />)
        }
        recent={
          state.recent.length === 0
            ? null
            : state.recent.map((item) => <Entry key={item.id} item={item} service={service} />)
        }
      />
      {createPortal(
        <div ref={region} className={styles.cards} data-notification-cards="" hidden={open}>
          {cards.map((item) => (
            <NoticeCard
              key={item.id}
              title={translate(t, item.title)}
              description={item.description ? translate(t, item.description) : undefined}
              tone={item.tone}
              icon={item.icon}
              dismissLabel={t("desktop.notice.dismiss.aria")}
              onDismiss={() => service.store.dismiss(item.id)}
              duration={item.required ? null : 8000}
              actions={<Actions item={item} service={service} />}
            />
          ))}
        </div>,
        document.body,
      )}
      {toast === null
        ? null
        : createPortal(
            <div className={styles.toast}>
              <Toast
                key={toast.id}
                message={translate(t, toast.message)}
                onDismiss={service.dismissToast}
              />
            </div>,
            document.body,
          )}
    </>
  );
}
function Entry({ item, service }: { item: NotificationRecord; service: NotificationService }) {
  const t = useT();
  return (
    <div className={styles.entry}>
      <span className={styles.tile} data-tone={item.tone}>
        <Icon name={item.icon} size={14} />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{translate(t, item.title)}</p>
        {item.description ? (
          <p className={styles.description}>{translate(t, item.description)}</p>
        ) : null}
        <ButtonGroup size="sm">
          <Actions item={item} service={service} />
        </ButtonGroup>
      </div>
    </div>
  );
}
function Actions({ item, service }: { item: NotificationRecord; service: NotificationService }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  return item.actions?.map((action) => (
    <Button
      key={action.id}
      disabled={pending || !service.actions.has(action.id)}
      variant={action.primary ? "primary" : "neutral"}
      onClick={() => {
        const handler = service.actions.get(action.id);
        if (!handler) return;
        setPending(true);
        void handler()
          .then(() => service.store.dismiss(item.id))
          .catch((error) => console.error("NOTIFICATION_ACTION_FAILED", error))
          .finally(() => setPending(false));
      }}
    >
      {translate(t, action.label)}
    </Button>
  ));
}
