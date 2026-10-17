import { UserText } from "@runyard/ui";
import { Chevron, EntryIcon, toneOf } from "../file-tree/FileTreeGlyph.tsx";
import styles from "./PathTreeView.module.css";
import type { PathNode } from "./path-tree.ts";

// 只读的文件树（模板详情的“包含的文件”）：文件夹默认展开，不能折叠，没有选中。
export function PathTreeView({ nodes }: { nodes: readonly PathNode[] }) {
  return (
    <ul className={styles.list}>
      {nodes.map((node) => (
        <PathTreeItem key={node.path} node={node} />
      ))}
    </ul>
  );
}

function PathTreeItem({ node }: { node: PathNode }) {
  const kind = node.directory ? "folder" : "file";
  return (
    <li>
      <span className={styles.row}>
        <span className={styles.chevron}>
          <Chevron visible={node.directory} open />
        </span>
        <span className={styles.icon} data-tone={toneOf({ name: node.name, kind })}>
          <EntryIcon kind={kind} tone={toneOf({ name: node.name, kind })} />
        </span>
        <UserText mono className={styles.name} data-directory={node.directory ? "" : undefined}>
          {node.name}
        </UserText>
      </span>
      {node.directory ? (
        <ul className={styles.children}>
          {node.children.map((child) => (
            <PathTreeItem key={child.path} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
