import { useT } from "@runyard/i18n/react";
import { Button, CopyableCommand, Icon } from "@runyard/ui";
import { useEffect, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { DesktopError, TabRow } from "../../shared/library-state.ts";
import styles from "./FailureScreen.module.css";
import { missingToolOf, urlLabel } from "./failure-view.ts";
import { useErrorText } from "./use-error-text.ts";

export interface MissingToolProps {
  bridge: DesktopBridge;
  tab: TabRow;
  failure: DesktopError;
}

// 缺少运行环境（设计稿 Missing、MissingLight，规格 DESKTOP-WORKSPACE-18）：缺哪个工具、需要什么版本、
// 当前是什么、安装命令和官网（来自错误参数：模板自己写的 installCommand / installUrl）。
// 命令只展示和复制，应用从不执行；“重新检测”就是再启动一次，通过了项目就启动。
// “已经装了？指定路径…”要接设置里的同一个入口，设置页做完前先不放（见 PR 的“与设计稿的差异”）。
export function MissingTool({ bridge, tab, failure }: MissingToolProps) {
  const t = useT();
  const errorText = useErrorText();
  const fields = missingToolOf(failure.params);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = (command: string) => {
    void bridge.call("clipboard.copy", command);
    setCopied(true);
  };
  return (
    <div className={styles.root} data-failure-screen="missing">
      <div className={styles.head}>
        <span aria-hidden="true" className={styles.tile}>
          <Icon name="warning" size={20} />
        </span>
        <div className={styles.heading}>
          <h2 className={styles.title}>{errorText(failure, "title")}</h2>
          <p className={styles.description}>{errorText(failure, "hint")}</p>
        </div>
      </div>
      <dl className={styles.facts}>
        <dt>{t("desktop.missing.need.label")}</dt>
        <dd>
          {t("desktop.missing.requirement.label", { tool: fields.tool, required: fields.required })}
        </dd>
        <dt>{t("desktop.missing.current.label")}</dt>
        <dd className={styles.warn}>{fields.found ?? t("desktop.missing.notInstalled.label")}</dd>
        {fields.installCommand === null ? null : (
          <>
            <dt>{t("desktop.missing.command.label")}</dt>
            <dd>
              <CopyableCommand
                label={t("desktop.missing.command.label")}
                command={fields.installCommand}
              />
            </dd>
          </>
        )}
        {fields.installUrl === null ? null : (
          <>
            <dt>{t("desktop.missing.site.label")}</dt>
            <dd>
              <button
                type="button"
                className={styles.link}
                onClick={() => void bridge.call("link.open", fields.installUrl ?? "")}
              >
                {urlLabel(fields.installUrl)}
              </button>
            </dd>
          </>
        )}
      </dl>
      <div className={styles.actions}>
        {fields.installCommand === null ? null : (
          <Button onClick={() => copy(fields.installCommand ?? "")}>
            {copied ? t("desktop.missing.copied.label") : t("desktop.missing.copy.action")}
          </Button>
        )}
        <Button
          variant="primary"
          icon="refresh"
          disabled={tab.busy}
          onClick={() => void bridge.call("run.start", tab.id)}
        >
          {t("desktop.missing.recheck.action")}
        </Button>
      </div>
      <p className={styles.note}>{t("desktop.missing.promise.label")}</p>
    </div>
  );
}
