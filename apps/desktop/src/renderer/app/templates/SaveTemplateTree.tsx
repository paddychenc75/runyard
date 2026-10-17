import { useT } from "@runyard/i18n/react";
import { Checkbox, UserText } from "@runyard/ui";
import type { CSSProperties } from "react";
import type { ExcludedEntry } from "../../../shared/templates-view.ts";
import { Chevron, EntryIcon, toneOf } from "../file-tree/FileTreeGlyph.tsx";
import { filesUnder, type PathNode } from "./path-tree.ts";
import styles from "./SaveTemplateTree.module.css";
import { exclusionLabel } from "./template-labels.ts";

export interface SaveTemplateTreeProps {
  nodes: readonly PathNode[];
  excluded: readonly ExcludedEntry[];
  /** 去掉了勾的文件 */
  unchecked: ReadonlySet<string>;
  /** 勾上的默认不包含项 */
  included: ReadonlySet<string>;
  onToggleFiles: (files: string[], checked: boolean) => void;
  onToggleExcluded: (path: string, checked: boolean) => void;
}

// 带勾选框的文件树（设计稿 SaveTemplate）：上面是默认会进模板的，勾选框默认全勾上；
// 下面“默认不包含”的依赖目录、.env、构建产物默认没勾，右侧写明为什么不包含（规格 DESKTOP-TEMPLATES-VIEW-07）。
export function SaveTemplateTree(props: SaveTemplateTreeProps) {
  const t = useT();
  return (
    <ul className={styles.root} aria-label={t("desktop.saveTemplate.files.aria")}>
      {props.nodes.map((node) => (
        <IncludedRow key={node.path} node={node} depth={0} {...props} />
      ))}
      {props.excluded.length === 0 ? null : (
        <>
          <li className={styles.divider} aria-hidden="true" />
          <li className={styles.excludedTitle}>{t("desktop.saveTemplate.excluded.label")}</li>
          {props.excluded.map((entry) => (
            <li
              key={entry.path}
              className={styles.row}
              data-excluded=""
              style={{ "--depth": 0 } as CSSProperties}
            >
              <Checkbox
                labelHidden
                label={<UserText mono>{entry.path}</UserText>}
                checked={props.included.has(entry.path)}
                onCheckedChange={(checked) => props.onToggleExcluded(entry.path, checked)}
              />
              <span className={styles.chevron}>
                <Chevron visible={false} open={false} />
              </span>
              <span className={styles.icon} data-tone={entry.directory ? "folder" : "other"}>
                <EntryIcon
                  kind={entry.directory ? "folder" : "file"}
                  tone={entry.directory ? "folder" : "other"}
                />
              </span>
              <UserText
                mono
                className={styles.name}
                data-directory={entry.directory ? "" : undefined}
              >
                {entry.path}
              </UserText>
              <span className={styles.reason}>{exclusionLabel(t, entry.reason)}</span>
            </li>
          ))}
        </>
      )}
    </ul>
  );
}

function IncludedRow(props: SaveTemplateTreeProps & { node: PathNode; depth: number }) {
  const { node, depth, unchecked } = props;
  const files = filesUnder(node);
  const checked = files.some((file) => !unchecked.has(file));
  const kind = node.directory ? "folder" : "file";
  const tone = toneOf({ name: node.name, kind });
  return (
    <>
      <li
        className={styles.row}
        data-path={node.path}
        style={{ "--depth": depth } as CSSProperties}
      >
        <Checkbox
          labelHidden
          label={<UserText mono>{node.path}</UserText>}
          checked={checked}
          onCheckedChange={(next) => props.onToggleFiles(files, next)}
        />
        <span className={styles.chevron}>
          <Chevron visible={node.directory} open />
        </span>
        <span className={styles.icon} data-tone={tone}>
          <EntryIcon kind={kind} tone={tone} />
        </span>
        <UserText mono className={styles.name} data-directory={node.directory ? "" : undefined}>
          {node.name}
        </UserText>
      </li>
      {node.children.map((child) => (
        <IncludedRow key={child.path} {...props} node={child} depth={depth + 1} />
      ))}
    </>
  );
}
