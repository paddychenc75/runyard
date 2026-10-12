import { unlink } from "node:fs/promises";
import { discoveryFilePath, type Platform } from "@runyard/platform";
import { type SupervisorFile, supervisorFileSchema } from "@runyard/protocol";

// 发现文件 ~/.runyard/run/supervisor.json（storage.md 2.4）：含口令，只有本人可读。
// 写入交给平台层的 fs.writeAtomic（先写临时文件、刷盘再改名，private 即权限 600）：
// 读的人要么看到旧的完整文件，要么看到新的完整文件，看不到写了一半的。

export interface DiscoveryStore {
  write(file: SupervisorFile): Promise<void>;
  remove(): Promise<void>;
}

// 路径的定义在平台层（client 也要读同一个文件）；这里原样再导出，supervisor 的使用者不受影响
export { discoveryFilePath };

export function createPlatformDiscoveryStore(platform: Platform): DiscoveryStore {
  const path = discoveryFilePath(platform.paths.stateDir);
  return {
    async write(file) {
      const checked = supervisorFileSchema.parse(file);
      await platform.fs.writeAtomic(path, `${JSON.stringify(checked)}\n`, { private: true });
    },
    async remove() {
      try {
        // delete-allow: 管理进程自己的发现文件（口令随进程失效），不是用户的内容
        await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}
