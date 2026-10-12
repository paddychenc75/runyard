import { promises as fs } from "node:fs";
import { type AbsPath, joinPath, posixRelPath } from "@runyard/platform";
import { type SupervisorFile, supervisorFileSchema } from "@runyard/protocol";

// 发现文件 ~/.runyard/run/supervisor.json（storage.md 2.4）：含口令，只有本人可读。
// 先写临时文件再改名，读的人要么看到旧的完整文件，要么看到新的完整文件，看不到写了一半的。
// 平台层的 fs.writeAtomic 还没实现（#28），而且接口里没有权限参数，所以这里自己写；
// 接口补齐后再换过去（权限仍必须是 600）。

export interface DiscoveryStore {
  write(file: SupervisorFile): Promise<void>;
  remove(): Promise<void>;
}

const OWNER_ONLY_FILE = 0o600;

export function discoveryFilePath(stateDir: AbsPath): AbsPath {
  return joinPath(stateDir, posixRelPath("run/supervisor.json"));
}

export function createNodeDiscoveryStore(path: AbsPath): DiscoveryStore {
  return {
    async write(file) {
      const checked = supervisorFileSchema.parse(file);
      const temp = `${path}.${process.pid}.tmp`;
      // 上次崩溃可能留下同名临时文件（进程号被复用），先清掉
      await fs.rm(temp, { force: true });
      // wx：临时文件不许已经存在；mode 在创建时就是 600，没有“先建后改”的空档
      const handle = await fs.open(temp, "wx", OWNER_ONLY_FILE);
      try {
        await handle.writeFile(`${JSON.stringify(checked)}\n`);
        await handle.sync();
      } catch (error) {
        await handle.close();
        await fs.rm(temp, { force: true });
        throw error;
      }
      await handle.close();
      try {
        await fs.rename(temp, path);
      } catch (error) {
        await fs.rm(temp, { force: true });
        throw error;
      }
    },
    async remove() {
      await fs.rm(path, { force: true });
    },
  };
}
