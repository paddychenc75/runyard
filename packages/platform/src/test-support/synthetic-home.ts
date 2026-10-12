import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AbsPath } from "../path-types.ts";
import { makeTempHome } from "./temp-home.ts";

// 合成的主目录：假的版本管理器、假的可执行文件、启动文件。全在临时目录里，不碰真实的 dotfile，
// 不碰桌面、文档、下载（项目文件夹也建在临时主目录里）。

export interface SyntheticHome {
  readonly home: AbsPath;
  /** 写一个文件（相对主目录）；内容以 #! 开头就同时设为可执行 */
  write(relative: string, content: string): string;
  remove(): void;
}

export function makeSyntheticHome(): SyntheticHome {
  const { home, remove } = makeTempHome();
  return {
    home,
    write(relative, content) {
      const file = join(home, relative);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
      if (content.startsWith("#!")) chmodSync(file, 0o755);
      return file;
    },
    remove,
  };
}

/** 打印固定版本的假工具 */
export function fixedTool(output: string): string {
  return `#!/bin/sh\necho '${output}'\n`;
}

/**
 * 按工作目录选版本的假垫片（Volta、mise shims、asdf、pyenv 的共同行为：执行时看 $PWD 里的版本文件，
 * 没有再看主目录）。node 读 .node-version 或 .tool-versions，python 读 .python-version
 */
export function shimTool(tool: "node" | "python"): string {
  if (tool === "python") {
    return [
      "#!/bin/sh",
      'if [ -f "$PWD/.python-version" ]; then v=$(cat "$PWD/.python-version"); else v=$(cat "$HOME/.default-python"); fi',
      'echo "Python $v"',
      "",
    ].join("\n");
  }
  return [
    "#!/bin/sh",
    'if [ -f "$PWD/.node-version" ]; then v=$(cat "$PWD/.node-version")',
    'elif [ -f "$PWD/.tool-versions" ]; then v=$(sed -n "s/^nodejs //p" "$PWD/.tool-versions")',
    'elif [ -f "$HOME/.tool-versions" ]; then v=$(sed -n "s/^nodejs //p" "$HOME/.tool-versions")',
    'else v=$(cat "$HOME/.default-node"); fi',
    'echo "v$v"',
    "",
  ].join("\n");
}
