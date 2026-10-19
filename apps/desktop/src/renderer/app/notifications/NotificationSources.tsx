import { useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { DesktopError, LibraryState, PlaygroundRow } from "../../../shared/library-state.ts";
import { ActionFailedDialog } from "../ActionFailedDialog.tsx";
import { TrashConfirmDialog } from "../TrashConfirmDialog.tsx";
import { useNotificationService } from "./notification-context.tsx";
import { NotificationSourcesController } from "./notification-sources-controller.ts";
import { notificationText as t } from "./notification-text.ts";

export function NotificationSources({
  bridge,
  library,
}: {
  bridge: DesktopBridge;
  library: LibraryState | null;
}) {
  const service = useNotificationService();
  const current = useRef(library);
  current.current = library;
  const [failed, setFailed] = useState<DesktopError | null>(null);
  const [request, setRequest] = useState<{
    row: PlaygroundRow;
    answer: (value: boolean) => void;
    terminalCommand: string | null;
  } | null>(null);
  const controller = useRef<NotificationSourcesController | null>(null);
  useEffect(() => {
    const source = new NotificationSourcesController(
      service,
      bridge,
      async (id) => {
        const row = current.current?.playgrounds.find((item) => item.id === id);
        if (!row) return true;
        const terminal = await bridge.call("terminal.status", { project: id }).catch(() => null);
        return await new Promise<boolean>((answer) =>
          setRequest({ row, answer, terminalCommand: terminal?.command ?? null }),
        );
      },
      setFailed,
    );
    controller.current = source;
    if (current.current) source.sync(current.current);
    return () => {
      source.dispose();
      controller.current = null;
    };
  }, [service, bridge]);
  useEffect(() => {
    if (library) controller.current?.sync(library);
  }, [library]);
  const confirm = async () => {
    if (!request) return;
    const pending = request;
    setRequest(null);
    try {
      const result = await bridge.call("playground.trash", pending.row.id);
      if (result.ok) service.showToast(t("desktop.notifications.trashed.label"));
      else setFailed(result.error);
      pending.answer(result.ok);
    } catch {
      setFailed({ code: "INTERNAL", params: {} });
      pending.answer(false);
    }
  };
  return (
    <>
      <TrashConfirmDialog
        open={request !== null}
        name={request?.row.name ?? ""}
        running={request?.row.active ?? false}
        terminalCommand={request?.terminalCommand ?? null}
        onConfirm={() => void confirm()}
        onCancel={() => {
          request?.answer(false);
          setRequest(null);
        }}
      />
      {failed === null ? null : (
        <ActionFailedDialog error={failed} onClose={() => setFailed(null)} />
      )}
    </>
  );
}
