import { useT } from "@runyard/i18n/react";
import { UserText } from "@runyard/ui";
import styles from "./EditorBreadcrumb.module.css";
import { pathSegments } from "./path-names.ts";

// 项目名 › 文件夹 › 文件名（设计稿 WebLight 标签条下面那一行）
export function EditorBreadcrumb({ project, path }: { project: string; path: string }) {
  const t = useT();
  return (
    <nav aria-label={t("desktop.editor.breadcrumb.aria")} className={styles.root}>
      <UserText className={styles.segment}>{project}</UserText>
      {pathSegments(path).map((segment, index, all) => (
        <UserText key={all.slice(0, index + 1).join("/")} className={styles.segment}>
          {segment}
        </UserText>
      ))}
    </nav>
  );
}
