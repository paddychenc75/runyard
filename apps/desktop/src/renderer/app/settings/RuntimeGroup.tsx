import { useT } from "@runyard/i18n/react";
import type { ToolCheck, ToolchainReport } from "@runyard/protocol";
import { Button, Icon, Menu } from "@runyard/ui";
import { useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import { RuntimeDetail } from "./RuntimeDetail.tsx";
import styles from "./RuntimeGroup.module.css";
import { SettingsGroup, SettingsNote } from "./SettingsGroup.tsx";
import { SettingsLink } from "./SettingsLink.tsx";
import { StatusLine } from "./StatusLine.tsx";
import { focusToolPath, ToolPathInput } from "./ToolPathInput.tsx";
import { toolName } from "./tool-view.ts";
import { useToolchain } from "./use-toolchain.ts";

/** 没有这一项时表格里的占位（不是文案） */
const NONE = "—";

// 运行环境（设计稿 Settings，规格 DESKTOP-SETTINGS-15 至 19）：只列已有模板用到的工具，列为工具、版本、路径、
// 芯片架构、状态，每行有“指定路径…”；缺少或过旧的行点开看安装方式。先显示缓存的结果，后台检测完再更新。
export function RuntimeGroup({ bridge }: { bridge: DesktopBridge }) {
  const t = useT();
  const { tools, checking, recheck, apply } = useToolchain(bridge);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (tool: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(tool)) next.add(tool);
      return next;
    });

  // 读不到终端环境时检测结果只是常见位置的猜测（规格 DESKTOP-SETTINGS-19）
  const degraded = tools?.some((tool) => tool.source === "fallback") ?? false;
  return (
    <SettingsGroup
      title={t("settings.runtime.title")}
      note={<SettingsNote>{t("settings.runtime.note.label")}</SettingsNote>}
      action={
        <Button size="sm" icon="refresh" loading={checking} onClick={recheck}>
          {t("settings.runtime.recheck.action")}
        </Button>
      }
    >
      {degraded ? (
        <div className={styles.degraded} role="status">
          <Icon name="warning" size={14} />
          <span className={styles.degradedText}>{t("settings.runtime.envFailed.body")}</span>
          <SettingsLink onClick={recheck}>{t("settings.runtime.recheck.action")}</SettingsLink>
          <Menu
            label={t("settings.runtime.setPath.action")}
            entries={(tools ?? []).map((tool) => ({
              id: tool.tool,
              label: t("settings.runtime.toolName.label", { tool: toolName(tool.tool) }),
            }))}
            onSelect={focusToolPath}
            trigger={<SettingsLink>{t("settings.runtime.setPath.action")}</SettingsLink>}
          />
        </div>
      ) : null}
      <table className={styles.table} aria-label={t("settings.runtime.table.aria")}>
        <thead>
          <tr className={styles.row} data-head="">
            <th scope="col" data-col="tool">
              {t("settings.runtime.tool.label")}
            </th>
            <th scope="col" data-col="version">
              {t("settings.runtime.version.label")}
            </th>
            <th scope="col" data-col="path" className={styles.hidden}>
              {t("settings.runtime.path.label")}
            </th>
            <th scope="col" data-col="arch">
              {t("settings.runtime.arch.label")}
            </th>
            <th scope="col" data-col="status">
              {t("settings.runtime.status.label")}
            </th>
            <td data-col="link" />
          </tr>
        </thead>
        <tbody>
          {(tools ?? []).map((check) => {
            const expandable = check.status === "missing" || check.status === "too-old";
            return (
              <ToolRows
                key={check.tool}
                check={check}
                expandable={expandable}
                expanded={expandable && open.has(check.tool)}
                busy={checking}
                bridge={bridge}
                onApply={apply}
                onToggle={() => toggle(check.tool)}
                onSetPath={() => focusToolPath(check.tool)}
                onCopy={(command) => void bridge.call("clipboard.copy", command)}
                onRunInstall={() => void bridge.call("toolchain.runInstall", check.tool)}
                onRecheck={recheck}
                onOpenSite={(url) => void bridge.call("link.open", url)}
              />
            );
          })}
        </tbody>
      </table>
    </SettingsGroup>
  );
}

interface ToolRowsProps {
  check: ToolCheck;
  expandable: boolean;
  expanded: boolean;
  busy: boolean;
  bridge: DesktopBridge;
  onApply: (report: ToolchainReport) => void;
  onToggle: () => void;
  onSetPath: () => void;
  onCopy: (command: string) => void;
  onRunInstall: () => void;
  onRecheck: () => void;
  onOpenSite: (url: string) => void;
}

function ToolRows({
  check,
  expandable,
  expanded,
  bridge,
  onApply,
  busy,
  ...actions
}: ToolRowsProps) {
  const t = useT();
  const name = toolName(check.tool);
  return (
    <>
      <tr className={styles.row} data-expandable={expandable ? "" : undefined}>
        <th scope="row" className={styles.tool} data-col="tool">
          {expandable ? (
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={expanded}
              onClick={actions.onToggle}
            >
              {name}
            </button>
          ) : (
            name
          )}
        </th>
        <td className={styles.mono} data-col="version">
          {check.version ?? NONE}
        </td>
        <td className={styles.pathCell} data-col="path">
          <ToolPathInput bridge={bridge} tool={check.tool} path={check.path} onApply={onApply} />
        </td>
        <td className={styles.mono} data-col="arch">
          {check.arch ?? NONE}
        </td>
        <td data-col="status">
          <ToolStatus status={check.status} />
        </td>
        <td className={styles.setPath} data-col="link">
          <SettingsLink
            aria-label={`${t("settings.runtime.setPath.action")} ${name}`}
            onClick={actions.onSetPath}
          >
            {t("settings.runtime.setPath.action")}
          </SettingsLink>
        </td>
      </tr>
      {expanded ? (
        <tr className={styles.full}>
          <td colSpan={6} className={styles.detailCell}>
            <RuntimeDetail
              check={check}
              busy={busy}
              onCopy={actions.onCopy}
              onRunInstall={actions.onRunInstall}
              onRecheck={actions.onRecheck}
              onSetPath={actions.onSetPath}
              onOpenSite={actions.onOpenSite}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ToolStatus({ status }: { status: ToolCheck["status"] }) {
  const t = useT();
  if (status === "found") {
    return <StatusLine tone="ok">{t("settings.runtime.found.label")}</StatusLine>;
  }
  if (status === "unknown") {
    return <StatusLine tone="idle">{t("settings.runtime.unknown.label")}</StatusLine>;
  }
  return (
    <StatusLine tone="warn">
      {status === "too-old"
        ? t("settings.runtime.tooOld.label")
        : t("settings.runtime.missing.label")}
    </StatusLine>
  );
}
