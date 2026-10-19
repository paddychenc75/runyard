import { useT } from "@runyard/i18n/react";
import type { ToolCheck } from "@runyard/protocol";
import { Button, ButtonGroup, CopyableCommand } from "@runyard/ui";
import styles from "./RuntimeGroup.module.css";
import { SettingsLink } from "./SettingsLink.tsx";
import { rangeParts, toolName } from "./tool-view.ts";

export interface RuntimeDetailProps {
  check: ToolCheck;
  busy: boolean;
  onCopy: (command: string) => void;
  onRunInstall: () => void;
  onRecheck: () => void;
  onSetPath: () => void;
  onOpenSite: (url: string) => void;
}

// 缺少或版本过低的工具点开后的说明（设计稿 Settings 的 Go，规格 DESKTOP-SETTINGS-17）：
// 需要的版本、当前情况、本机的安装命令和官网；命令只展示和复制，“在终端中运行”由用户点了才交给终端。
export function RuntimeDetail({
  check,
  busy,
  onCopy,
  onRunInstall,
  onRecheck,
  onSetPath,
  onOpenSite,
}: RuntimeDetailProps) {
  const t = useT();
  const name = toolName(check.tool);
  const and = ` ${t("settings.runtime.and.label")} `;
  const requirement = `${name} ${rangeParts(check.required ?? "")
    .map((part) => `${part.operator} ${part.version}`)
    .join(and)}`;
  const hasRequirement = rangeParts(check.required ?? "").length > 0;
  return (
    <section className={styles.detail} aria-label={name}>
      <h3 className={styles.detailTitle}>
        {check.status === "too-old"
          ? t("settings.runtime.tooOld.title", { tool: name })
          : t("settings.runtime.missing.title", { tool: name })}
      </h3>
      <dl className={styles.facts}>
        {hasRequirement ? (
          <>
            <dt>{t("settings.runtime.need.label")}</dt>
            <dd className={styles.mono}>{requirement}</dd>
          </>
        ) : null}
        <dt>{t("settings.runtime.current.label")}</dt>
        <dd className={styles.warn}>
          {check.status === "too-old" ? (check.version ?? "") : t("settings.runtime.missing.label")}
        </dd>
        {check.installCommand === undefined ? null : (
          <>
            <dt>{t("settings.runtime.command.label")}</dt>
            <dd>
              <CopyableCommand
                label={t("settings.runtime.command.label")}
                command={check.installCommand}
                className={styles.command}
              />
            </dd>
          </>
        )}
        {check.installUrl === undefined ? null : (
          <>
            <dt>{t("settings.runtime.site.label")}</dt>
            <dd>
              <SettingsLink onClick={() => onOpenSite(check.installUrl ?? "")}>
                {siteLabel(check.installUrl)}
              </SettingsLink>
            </dd>
          </>
        )}
      </dl>
      <ButtonGroup>
        {check.installCommand === undefined ? null : (
          <>
            <Button onClick={() => onCopy(check.installCommand ?? "")}>
              {t("settings.runtime.copy.action")}
            </Button>
            <Button onClick={onRunInstall}>{t("settings.runtime.runInstall.action")}</Button>
          </>
        )}
        <Button variant="primary" loading={busy} onClick={onRecheck}>
          {t("settings.runtime.recheck.action")}
        </Button>
      </ButtonGroup>
      <div className={styles.already}>
        <span>{t("settings.runtime.installed.label")}</span>
        <SettingsLink onClick={onSetPath}>{t("settings.runtime.setPath.action")}</SettingsLink>
      </div>
    </section>
  );
}

/** 官网的显示写法：去掉协议和结尾的斜杠（go.dev/dl） */
function siteLabel(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
