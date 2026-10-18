import { useT } from "@runyard/i18n/react";
import { Button, ButtonGroup, CopyableCommand, GlassSurface, Icon } from "@runyard/ui";
import { useEffect, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { DesktopError, TabRow } from "../../shared/library-state.ts";
import styles from "./FailureScreen.module.css";
import { missingToolOf, urlLabel } from "./failure-view.ts";
import { toolName } from "./settings/tool-view.ts";
import { useErrorText } from "./use-error-text.ts";

export interface MissingToolProps {
  bridge: DesktopBridge;
  tab: TabRow;
  failure: DesktopError;
}

// 缺少运行环境（设计稿 Missing、MissingLight，规格 DESKTOP-WORKSPACE-18）：缺哪个工具、需要什么版本、
// 当前是什么、安装命令和官网（来自错误参数：模板自己写的 installCommand / installUrl）。
// 命令只展示和复制，应用从不执行；“重新检测”就是再启动一次，通过了项目就启动。
// “已经装了？指定路径…”和设置页“运行环境”里的是同一个入口（toolchain.pickPath）：选的文件能读出版本号才接受，
// 接受后再启动一次；不是可用的工具就写明，原来的路径不变。
export function MissingTool({ bridge, tab, failure }: MissingToolProps) {
  const t = useT();
  const errorText = useErrorText();
  const fields = missingToolOf(failure.params);
  const [copied, setCopied] = useState(false);
  const [invalidPath, setInvalidPath] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = (command: string) => {
    void bridge.call("clipboard.copy", command);
    setCopied(true);
  };
  // 和设置里“运行环境”的“在终端中运行”是同一个入口：只运行最近一次检测报告的安装命令，
  // 命令由主进程按工具标识查，界面传不进任何命令；先检测一次，保证“最近一次检测”是新的
  const runInTerminal = async () => {
    await bridge.call("toolchain.check", { cachedOnly: false });
    await bridge.call("toolchain.runInstall", fields.tool);
  };
  const setPath = async () => {
    const outcome = await bridge.call("toolchain.pickPath", fields.tool);
    setInvalidPath(outcome.status === "invalid" || outcome.status === "failed");
    if (outcome.status === "set") void bridge.call("run.start", tab.id);
  };
  return (
    <GlassSurface
      material="dialog"
      className={`${styles.root} ${styles.card}`}
      data-failure-screen="missing"
    >
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
          {t("desktop.missing.requirement.label", {
            tool: toolName(fields.tool),
            required: fields.required,
          })}
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
      <ButtonGroup size="md" className={styles.actions}>
        {fields.installCommand === null ? null : (
          <Button onClick={() => copy(fields.installCommand ?? "")}>
            {copied ? t("desktop.missing.copied.label") : t("desktop.missing.copy.action")}
          </Button>
        )}
        {fields.installCommand === null ? null : (
          <Button onClick={() => void runInTerminal()}>
            {t("settings.runtime.runInstall.action")}
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
      </ButtonGroup>
      <p className={styles.already}>
        <span>{t("settings.runtime.installed.label")}</span>
        <button type="button" className={styles.link} onClick={() => void setPath()}>
          {t("settings.runtime.setPath.action")}
        </button>
      </p>
      {invalidPath ? (
        <p className={styles.invalid} role="alert">
          {t("settings.runtime.invalidPath.body", { tool: toolName(fields.tool) })}
        </p>
      ) : null}
      <p className={styles.note}>{t("desktop.missing.promise.label")}</p>
    </GlassSurface>
  );
}
