// 项目内相对路径（正斜杠）的名字拆分，给文件标签和面包屑用。

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function pathSegments(path: string): string[] {
  return path === "" ? [] : path.split("/");
}
