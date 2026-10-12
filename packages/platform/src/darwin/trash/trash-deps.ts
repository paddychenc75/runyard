import { execFile } from "node:child_process";
import { cp, rename } from "node:fs/promises";

// 废纸篓用到的外部依赖，全部可注入：测试在这里造故障（复制漏文件、改名跨卷失败）和指向假的系统工具，
// 产品里用的是下面 defaultTrashOps 的真实现。

export interface TrashOps {
  /** 复制整棵目录（跨卷兜底用）。符号链接原样复制，不跟随 */
  copyTree(from: string, to: string): Promise<void>;
  /** 同卷改名（占位之后的那一步） */
  rename(from: string, to: string): Promise<void>;
  /** 运行系统自带的 trash 命令，参数数组、不经 shell；返回退出码，被超时杀掉返回 null */
  runTool(tool: string, argv: readonly string[]): Promise<number | null>;
}

export interface TrashConfig {
  /** 主目录：`<主目录>/.Trash` 是本卷的废纸篓 */
  readonly home: string;
  readonly uid: number;
  readonly now: () => Date;
  /**
   * 系统自带的 trash 命令（macOS 15 起有 /usr/bin/trash，保留“放回原处”）；null 表示不用。
   * 它只会把东西放进当前账号真实的废纸篓，所以主目录不是账号真实主目录时（测试用的临时主目录）必须是 null
   */
  readonly systemTool: string | null;
  readonly ops?: Partial<TrashOps>;
}

export const defaultTrashOps: TrashOps = {
  copyTree: (from, to) =>
    cp(from, to, {
      recursive: true,
      verbatimSymlinks: true,
      errorOnExist: true,
      force: false,
      preserveTimestamps: true,
    }),
  rename,
  async runTool(tool, argv) {
    return new Promise((resolve) => {
      // 参数数组，不经 shell；超时后被杀返回 null
      execFile(tool, [...argv], { timeout: 120_000 }, (error) => {
        if (error === null) resolve(0);
        else resolve(typeof error.code === "number" ? error.code : null);
      });
    });
  },
};
