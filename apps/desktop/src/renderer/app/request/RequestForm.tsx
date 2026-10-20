import type { Localized } from "@runyard/i18n";
import { useT } from "@runyard/i18n/react";
import { type RequestMethod, requestMethods } from "@runyard/protocol";
import { Button, Icon, Menu, Tooltip } from "@runyard/ui";
import styles from "./RequestPanel.module.css";
import type { RequestPanelState } from "./use-request-panel.ts";

export function RequestForm({
  panel,
  prefix,
  canSend,
  blockedHint,
}: {
  panel: RequestPanelState;
  prefix: string;
  canSend: boolean;
  blockedHint: Localized | null;
}) {
  const t = useT();
  const { draft } = panel;
  return (
    <form
      className={styles.sendRow}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) panel.send();
      }}
    >
      <MethodMenu value={draft.method} onSelect={panel.setMethod} />
      <label className={styles.address}>
        <Tooltip content={<span>{prefix}</span>}>
          <span className={styles.prefix}>{prefix}</span>
        </Tooltip>
        <input
          className={styles.path}
          type="text"
          value={draft.path}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={t("desktop.request.path.aria")}
          onChange={(event) => panel.patch({ path: event.target.value })}
        />
      </label>
      <Tooltip content={blockedHint ?? t("desktop.request.send.action")}>
        <span className={styles.sendHint}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!canSend}
            loading={panel.sending}
            onClick={(event) => {
              // 回车和点击都走表单提交，这里只防在途时再点
              if (panel.sending) event.preventDefault();
            }}
          >
            {t("desktop.request.send.action")}
          </Button>
        </span>
      </Tooltip>
    </form>
  );
}

function MethodMenu({
  value,
  onSelect,
}: {
  value: RequestMethod;
  onSelect: (method: RequestMethod) => void;
}) {
  const t = useT();
  return (
    <Menu
      label={t("desktop.request.method.aria")}
      trigger={
        <button type="button" className={styles.method} data-method={value}>
          {value}
          <Icon name="chevron-down" size={10} />
        </button>
      }
      entries={requestMethods.map((method) => ({
        id: method,
        label: t("desktop.request.methodOption.label", { method }),
        checked: method === value,
      }))}
      onSelect={(id) => onSelect(id as RequestMethod)}
    />
  );
}
