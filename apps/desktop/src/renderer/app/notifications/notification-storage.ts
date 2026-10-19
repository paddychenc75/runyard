import { desktopCatalogs, type MessageKey } from "@runyard/i18n";
import type {
  NotificationRecord,
  NotificationStorage,
  NotificationText,
} from "./notification-store.ts";

export const NOTIFICATION_STORAGE_KEY = "runyard.notifications.v1";
const keys = new Set(desktopCatalogs.flatMap((catalog) => Object.keys(catalog.en)));
const icons = new Set(["info", "warning", "spark", "refresh", "check", "exclamation"]);
function isText(value: unknown): value is NotificationText {
  if (typeof value !== "object" || value === null) return false;
  const { key, values } = value as Record<string, unknown>;
  return (
    typeof key === "string" &&
    keys.has(key as MessageKey) &&
    (values === undefined ||
      (typeof values === "object" &&
        values !== null &&
        Object.values(values).every(
          (item) => typeof item === "string" || typeof item === "number",
        )))
  );
}
export function isNotificationRecord(value: unknown): value is NotificationRecord {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.at === "number" &&
    Number.isFinite(row.at) &&
    typeof row.required === "boolean" &&
    ["accent", "warning", "violet", "danger"].includes(String(row.tone)) &&
    icons.has(String(row.icon)) &&
    isText(row.title) &&
    (row.description === undefined || isText(row.description)) &&
    (row.actions === undefined ||
      (Array.isArray(row.actions) &&
        row.actions.length <= 2 &&
        row.actions.every(
          (action) =>
            typeof action === "object" &&
            action !== null &&
            typeof action.id === "string" &&
            isText(action.label) &&
            (action.primary === undefined || typeof action.primary === "boolean"),
        )))
  );
}
export function createNotificationStorage(
  storage: Pick<Storage, "getItem" | "setItem">,
): NotificationStorage {
  return {
    read() {
      let raw: string | null;
      try {
        raw = storage.getItem(NOTIFICATION_STORAGE_KEY);
      } catch (error) {
        console.error("NOTIFICATION_STORAGE_READ_FAILED", error);
        return [];
      }
      if (raw === null) return [];
      try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isNotificationRecord) : [];
      } catch (error) {
        console.error("NOTIFICATION_STORAGE_INVALID", error);
        return [];
      }
    },
    write(records) {
      try {
        storage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(records));
      } catch (error) {
        console.error("NOTIFICATION_STORAGE_WRITE_FAILED", error);
      }
    },
  };
}
