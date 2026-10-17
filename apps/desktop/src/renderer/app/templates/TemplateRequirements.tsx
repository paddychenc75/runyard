import { useT } from "@runyard/i18n/react";
import { Icon, UserText } from "@runyard/ui";
import { Fragment } from "react";
import type { TemplateToolRow } from "../../../shared/templates-view.ts";
import styles from "./TemplateRequirements.module.css";
import { verdictLabel } from "./template-labels.ts";
import { rangeParts, rangePartText, toolLabel, verdictOf } from "./templates-model.ts";

// “依赖的运行环境”表：工具、需要的版本、这台电脑上的版本、是否满足。
// 这台电脑一列只用已有的检测结果，没检测过的留空，不触发检测（规格 DESKTOP-TEMPLATES-VIEW-03、04）。
export function TemplateRequirements({ tools }: { tools: readonly TemplateToolRow[] }) {
  const t = useT();
  const fallbacks = tools.filter((tool) => tool.fallback !== null);
  return (
    <section className={styles.section}>
      <h3 className={styles.title}>{t("desktop.templates.requires.title")}</h3>
      {tools.length === 0 ? (
        <p className={styles.none}>{t("desktop.templates.requiresNone.hint")}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t("desktop.templates.toolColumn.label")}</th>
              <th scope="col">{t("desktop.templates.requiredColumn.label")}</th>
              <th scope="col">{t("desktop.templates.hereColumn.label")}</th>
              <th scope="col">{t("desktop.templates.statusColumn.label")}</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((tool) => {
              const verdict = verdictOf(tool);
              return (
                <tr key={tool.tool} data-tool={tool.tool}>
                  <th scope="row" className={styles.tool}>
                    {toolLabel(tool.tool)}
                  </th>
                  <td className={styles.version}>
                    <UserText mono>
                      {rangeParts(tool.required).map((part, index) => (
                        <Fragment key={`${part.op ?? ""}${part.version}`}>
                          {index === 0 ? null : (
                            <span className={styles.and}>
                              {t("desktop.templates.rangeAnd.label")}
                            </span>
                          )}
                          {rangePartText(part)}
                        </Fragment>
                      ))}
                    </UserText>
                  </td>
                  <td className={styles.version} data-column="here">
                    {tool.version === null ? null : <UserText mono>{tool.version}</UserText>}
                  </td>
                  <td className={styles.status} data-verdict={verdict ?? undefined}>
                    {verdict === null ? null : (
                      <>
                        {verdict === "met" ? <Icon name="check" size={12} /> : null}
                        {verdictLabel(t, verdict)}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {fallbacks.map((tool) => (
        <p key={tool.tool} className={styles.fallback}>
          {t("desktop.templates.fallback.hint", {
            tool: toolLabel(tool.tool),
            fallback: toolLabel(tool.fallback ?? ""),
          })}
        </p>
      ))}
    </section>
  );
}
