// 相对路径的列表整理成文件夹树（模板详情的“包含的文件”和另存弹窗共用）。
// 文件夹排在前面，同类按名字排；路径用正斜杠。

export interface PathNode {
  name: string;
  path: string;
  directory: boolean;
  children: PathNode[];
}

const byName = (a: PathNode, b: PathNode): number =>
  a.directory === b.directory
    ? a.name < b.name
      ? -1
      : a.name > b.name
        ? 1
        : 0
    : a.directory
      ? -1
      : 1;

export function buildPathTree(files: readonly string[]): PathNode[] {
  const root: PathNode = { name: "", path: "", directory: true, children: [] };
  for (const file of files) {
    let parent = root;
    const segments = file.split("/");
    segments.forEach((name, index) => {
      const path = segments.slice(0, index + 1).join("/");
      const directory = index < segments.length - 1;
      let node = parent.children.find(
        (child) => child.name === name && child.directory === directory,
      );
      if (node === undefined) {
        node = { name, path, directory, children: [] };
        parent.children.push(node);
      }
      parent = node;
    });
  }
  const sortDeep = (node: PathNode): void => {
    node.children.sort(byName);
    for (const child of node.children) sortDeep(child);
  };
  sortDeep(root);
  return root.children;
}

/** 一个节点下面的全部文件（自己是文件就是它自己） */
export function filesUnder(node: PathNode): string[] {
  return node.directory ? node.children.flatMap(filesUnder) : [node.path];
}
