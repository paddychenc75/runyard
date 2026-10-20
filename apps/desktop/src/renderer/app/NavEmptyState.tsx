import { useT } from "@runyard/i18n/react";
import { EmptyState, Icon } from "@runyard/ui";
import type { NavFilter } from "../library-query.ts";
import styles from "./LibraryPage.module.css";
import emptyStyles from "./NavEmptyState.module.css";

export function NavEmptyState({ nav }: { nav: Exclude<NavFilter, "all"> }) {
  const t = useT();
  const title =
    nav === "running"
      ? t("library.emptyRunning.title")
      : nav === "agent"
        ? t("library.emptyAgent.title")
        : t("library.emptyAutoClean.title");
  const description =
    nav === "running"
      ? t("library.emptyRunning.hint")
      : nav === "agent"
        ? t("library.emptyAgent.hint")
        : t("library.emptyAutoClean.hint");
  if (nav === "agent")
    return (
      <div className={emptyStyles.root}>
        <Icon name="spark" size={96} className={emptyStyles.art} />
        <h2 className={emptyStyles.title}>{title}</h2>
        <p className={emptyStyles.description}>{description}</p>
        <code className={emptyStyles.command}>{t("library.emptyAgent.command.label")}</code>
      </div>
    );
  return <EmptyState className={styles.empty} title={title} description={description} />;
}
