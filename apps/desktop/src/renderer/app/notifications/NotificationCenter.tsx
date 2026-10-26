import type { Format, Localized, MessageKey, MessageValues, Translate } from "@runyard/i18n";
import { useFormat, useT } from "@runyard/i18n/react";
import { Button, ButtonGroup, Icon, IconButton, NoticeCard, NoticeList, Toast } from "@runyard/ui";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Bounds } from "../../../shared/layout.ts";
import { useOverlay } from "../../shared/overlay-context.tsx";
import { useWindowVisible } from "../use-window-visible.ts";
import styles from "./NotificationCenter.module.css";
import { useNotificationService } from "./notification-context.tsx";
import type { NotificationService } from "./notification-service.ts";
import type {
  NotificationRecord,
  NotificationSnapshot,
  NotificationText,
} from "./notification-store.ts";

// 存储层只接受已有文案键和纯数据参数；翻译发生在当前语言的渲染期间。
function translate(t: Translate, text: NotificationText, format?: Format): Localized {
  const values =
    text.relativeTime === undefined
      ? text.values
      : { ...text.values, time: format?.relativeTime(text.relativeTime, Date.now()) ?? "" };
  return (t as (key: MessageKey, values?: MessageValues) => Localized)(text.key, values);
}
export function NotificationCenter({
  service: suppliedService,
}: {
  service?: NotificationService;
}) {
  const contextService = useNotificationService();
  const service = suppliedService ?? contextService;
  const t = useT();
  const state = useSyncExternalStore(service.store.subscribe, service.store.snapshot);
  const toast = useSyncExternalStore(service.subscribeToast, service.getToast);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => service.store.prune(), 60_000);
    return () => clearInterval(timer);
  }, [service]);
  useOverlay(open);
  useOverlay(toast !== null);
  return (
    <>
      <NotificationMenu service={service} state={state} open={open} setOpen={setOpen} />
      <NotificationCards service={service} state={state} open={open} />
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
interface NotificationViewProps {
  service: NotificationService;
  state: NotificationSnapshot;
  open: boolean;
}
function NotificationMenu({
  service,
  state,
  open,
  setOpen,
}: NotificationViewProps & { setOpen: (open: boolean) => void }) {
  const t = useT();
  const format = useFormat();
  return (
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
  );
}
function NotificationCards({ service, state, open }: NotificationViewProps) {
  const t = useT();
  const format = useFormat();
  const region = useRef<HTMLElement>(null);
  const [bounds, setBounds] = useState<Bounds>();
  const records = [...state.required, ...state.recent];
  const cards = state.cards.flatMap((id) => records.filter((item) => item.id === id));
  const visible = useWindowVisible();
  useEffect(() => {
    service.markShown(visible && !open ? state.cards : []);
  }, [service, state, visible, open]);
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
  }, [state.cards.length, open]);
  useOverlay(!open && cards.length > 0, bounds);
  return createPortal(
    <section
      ref={region}
      className={styles.cards}
      data-notification-cards=""
      hidden={open || cards.length === 0}
      aria-label={t("desktop.notice.region.aria")}
      aria-live="polite"
      aria-atomic={false}
      aria-relevant="additions text"
    >
      {cards.map((item) => (
        <NoticeCard
          key={item.id}
          title={translate(t, item.title)}
          description={item.description ? translate(t, item.description, format) : undefined}
          tone={item.tone}
          icon={item.icon}
          dismissLabel={t("desktop.notice.dismiss.aria")}
          onDismiss={() => service.store.dismiss(item.id)}
          duration={item.required ? null : 8000}
          actions={item.actions?.length ? <Actions item={item} service={service} /> : undefined}
        >
          {item.details?.map((text, index) => (
            <p className={styles.detail} key={`${item.id}-${index}`}>
              {translate(t, text)}
            </p>
          ))}
        </NoticeCard>
      ))}
    </section>,
    document.body,
  );
}

function Entry({ item, service }: { item: NotificationRecord; service: NotificationService }) {
  const t = useT();
  const format = useFormat();
  return (
    <div className={styles.entry}>
      <span className={styles.tile} data-tone={item.tone}>
        <Icon name={item.icon} size={14} />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{translate(t, item.title)}</p>
        {item.description ? (
          <p className={styles.description}>{translate(t, item.description, format)}</p>
        ) : null}
        {item.details?.map((text, index) => (
          <p className={styles.description} key={`${item.id}-${index}`}>
            {translate(t, text)}
          </p>
        ))}
        {item.required ? (
          <ButtonGroup size="sm" className={styles.actions}>
            <Actions item={item} service={service} />
          </ButtonGroup>
        ) : null}
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
          .then((result) => {
            if (result !== false) service.store.dismiss(item.id);
          })
          .catch((error) => console.error("NOTIFICATION_ACTION_FAILED", error))
          .finally(() => setPending(false));
      }}
    >
      {translate(t, action.label)}
    </Button>
  ));
}
