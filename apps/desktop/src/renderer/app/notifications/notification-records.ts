import type {
  AppNotice,
  CleanReminderItem,
  PlaygroundRow,
  UpdateBannerView,
} from "../../../shared/library-state.ts";
import type { NotificationRecord } from "./notification-store.ts";
import { notificationText as t } from "./notification-text.ts";

export function updateNotification(update: UpdateBannerView, at: number): NotificationRecord {
  const id = `update:${update.latest}`;
  return {
    id,
    at,
    required: true,
    tone: "accent",
    icon: "download",
    title: t("desktop.notifications.update.label", { version: update.latest }),
    description: t("desktop.notifications.current.label", { version: update.current }),
    actions: [
      { id: `${id}:later`, label: t("desktop.update.later.action") },
      { id: `${id}:download`, label: t("desktop.update.download.action"), primary: true },
    ],
  };
}
export function cleanNotification(
  items: readonly CleanReminderItem[],
  at: number,
): NotificationRecord {
  const id = `clean:${items
    .map((item) => item.id)
    .sort()
    .join(",")}`;
  return {
    id,
    at,
    required: true,
    tone: "warning",
    icon: "clock",
    title: t("library.cleanBanner.lead.label", { count: items.length }),
    details: items.map((item) =>
      t("desktop.notifications.cleanItem.label", { name: item.name, days: item.idleDays }),
    ),
    actions: [
      { id: `${id}:now`, label: t("library.clean.now.action") },
      { id: `${id}:keep`, label: t("desktop.notifications.keep.action"), primary: true },
    ],
  };
}
export function transientNotification(
  notice: AppNotice,
  at: number,
  rows: readonly PlaygroundRow[],
): NotificationRecord {
  const base = { id: `notice:${notice.id}`, at, required: false } as const;
  if (notice.kind === "agent-run") {
    const row = rows.find((item) => item.id === notice.playgroundId);
    const url = notice.url ?? (row?.port ? `http://127.0.0.1:${row.port}/` : null);
    return {
      ...base,
      tone: "violet",
      icon: "spark",
      title:
        notice.agent === null
          ? t("desktop.agentNotice.unnamed.label", { name: notice.name })
          : t("desktop.agentNotice.title.label", { agent: notice.agent, name: notice.name }),
      ...(url
        ? {
            description: {
              ...t("desktop.agentNotice.meta.label", { url, time: "" }),
              relativeTime: at,
            },
          }
        : {}),
      actions: [
        { id: `${base.id}:stop`, label: t("desktop.stop.action") },
        { id: `${base.id}:open`, label: t("library.row.open.action"), primary: true },
      ],
    };
  }
  if (notice.kind === "path-near-limit")
    return {
      ...base,
      tone: "warning",
      icon: "warning",
      title: t("desktop.pathNotice.title.label", { name: notice.name }),
      description: t("notice.PATH_NEAR_LIMIT", { length: notice.length, limit: notice.limit }),
    };
  const values = { value: notice.value ?? "" };
  const title =
    notice.code === "open-missing"
      ? t("desktop.linkNotice.openMissing.label", values)
      : notice.code === "new-no-template"
        ? t("desktop.linkNotice.newNoTemplate.label", values)
        : notice.code === "new-name-invalid"
          ? t("desktop.linkNotice.newNameInvalid.label", values)
          : notice.code === "new-name-taken"
            ? t("desktop.linkNotice.newNameTaken.label", values)
            : notice.code === "new-failed"
              ? t("desktop.linkNotice.newFailed.label", values)
              : notice.code === "open-invalid"
                ? t("desktop.linkNotice.openInvalid.label")
                : notice.code === "new-busy"
                  ? t("desktop.linkNotice.newBusy.label")
                  : notice.code === "new-throttled"
                    ? t("desktop.linkNotice.newThrottled.label")
                    : t("desktop.linkNotice.linkInvalid.label");
  return { ...base, tone: "warning", icon: "info", title };
}
