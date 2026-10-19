import { createContext, useContext } from "react";
import { getNotificationService, type NotificationService } from "./notification-service.ts";

export const NotificationContext = createContext<NotificationService | null>(null);
export function useNotificationService(): NotificationService {
  return useContext(NotificationContext) ?? getNotificationService();
}
