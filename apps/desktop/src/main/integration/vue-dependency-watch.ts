import { type FSWatcher, watch } from "node:fs";
import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

/** 仅监听项目根与 node_modules 的直接子项，不递归扫描依赖树。安装器建好链接时刷新类型。 */
export async function watchVueDependencies(
  folder: string,
  changed: () => void,
): Promise<() => void> {
  const root = await realpath(folder);
  let modules: FSWatcher | undefined;
  let closed = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!closed) changed();
    }, 200);
  };
  const attach = async () => {
    const epoch = ++generation;
    modules?.close();
    modules = undefined;
    try {
      const path = await realpath(join(root, "node_modules"));
      const rel = relative(root, path);
      if (closed || epoch !== generation || isAbsolute(rel) || rel.startsWith("..")) return;
      const watcher = watch(path, { persistent: false }, notify);
      modules = watcher;
      watcher.on("error", () => {
        watcher.close();
        if (modules === watcher) modules = undefined;
      });
    } catch {
      /* 没装依赖时只监听根目录，安装创建 node_modules 后再接上。 */
    }
  };
  const project = watch(root, { persistent: false }, (_event, name) => {
    if (String(name) === "node_modules") {
      void attach();
      notify();
    }
  });
  project.on("error", () => project.close());
  await attach();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    modules?.close();
    project.close();
  };
}
