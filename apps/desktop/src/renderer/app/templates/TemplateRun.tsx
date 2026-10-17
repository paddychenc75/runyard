import { useT } from "@runyard/i18n/react";
import { UserText } from "@runyard/ui";
import type { TemplateRunView } from "../../../shared/templates-view.ts";
import styles from "./TemplateRun.module.css";
import { readyViewOf } from "./templates-model.ts";

// “运行方式”：安装依赖、启动、就绪判断。命令只是展示，应用不会在这里执行它们。
export function TemplateRun({ run }: { run: TemplateRunView }) {
  const t = useT();
  const ready = run.ready === null ? null : readyViewOf(run.ready);
  return (
    <section className={styles.section}>
      <h3 className={styles.title}>{t("desktop.templates.run.title")}</h3>
      {run.install === null ? null : (
        <div className={styles.row}>
          <span className={styles.label}>{t("desktop.templates.runInstall.label")}</span>
          <UserText mono className={styles.code}>
            {run.install}
          </UserText>
        </div>
      )}
      {run.start === null ? null : (
        <div className={styles.row}>
          <span className={styles.label}>{t("desktop.templates.runStart.label")}</span>
          <UserText mono className={styles.code}>
            {run.start}
          </UserText>
        </div>
      )}
      {ready === null ? null : (
        <div className={styles.row}>
          <span className={styles.label}>{t("desktop.templates.runReady.label")}</span>
          <span className={styles.code}>
            {ready.kind === "http" ? (
              <UserText mono>{ready.url}</UserText>
            ) : ready.kind === "port" ? (
              t("desktop.templates.readyPort.label")
            ) : (
              t("desktop.templates.readyLog.label", { match: ready.match })
            )}
          </span>
        </div>
      )}
    </section>
  );
}
