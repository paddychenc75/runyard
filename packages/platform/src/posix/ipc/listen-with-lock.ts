import { promises as fs } from "node:fs";
import { createServer, type Server } from "node:net";
import { platformError } from "../../platform-error.ts";
import { errnoOf } from "../fs/map-fs-error.ts";
import type { IpcLocations } from "./endpoint.ts";
import type { KernelLock, LockStrategy } from "./kernel-lock.ts";

// 单实例：先拿内核锁，拿到才删除残留的 socket 文件并监听，监听后权限 600（决策记录 0005，证据“单实例”一节）。
// 只靠“监听失败即退出”不够：socket 文件在进程死后会留下，“探测、删除、再监听”会让并发的两个启动者各起一个。
// 拿到锁之后连接点上留着的一切都是残留，包括别人抢先占住的 socket 文件：
// 能在这个 700 的目录里建文件的只有本人（证据实验 E、F）。

const OWNER_ONLY_DIR = 0o700;
const OWNER_ONLY_FILE = 0o600;

async function ensureRunDir(locations: IpcLocations): Promise<void> {
  await fs.mkdir(locations.runDir, { recursive: true, mode: OWNER_ONLY_DIR });
  // 目录已经存在时 mkdir 不会改权限，这里收紧
  await fs.chmod(locations.runDir, OWNER_ONLY_DIR);
}

// 绑定瞬间的 umask 设成 077，socket 从创建起就只有本人可访问，没有“先建后改”的空档。
// process.umask 在工作线程里不可用，那时退回到绑定后 chmod
function bindOwnerOnly(server: Server, path: string, onListening: () => void): void {
  let previous: number | undefined;
  try {
    previous = process.umask(0o077);
  } catch {
    previous = undefined;
  }
  try {
    server.listen({ path }, onListening);
  } finally {
    if (previous !== undefined) process.umask(previous);
  }
}

function listenOn(path: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    bindOwnerOnly(server, path, () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

// 先拿到内核锁才会走到这里，所以残留的 socket 文件一定是上一个已经死掉的管理进程留下的
async function removeStaleSocket(path: string): Promise<void> {
  try {
    // delete-allow: 管理进程自己的 run/supervisor.sock 残留（单个文件，不是用户的内容）
    await fs.unlink(path);
  } catch (error) {
    if (errnoOf(error) !== "ENOENT") throw error;
  }
}

export async function listenWithLock(
  locations: IpcLocations,
  lockStrategy: LockStrategy,
  socketPath: string,
): Promise<Server> {
  await ensureRunDir(locations);
  const lock = await lockStrategy.acquire();
  if (lock === null) {
    throw platformError(
      "BUSY",
      { name: socketPath },
      "another process holds the supervisor lock, a supervisor is already running",
    );
  }
  try {
    await removeStaleSocket(socketPath);
    const server = await listenOn(socketPath);
    await fs.chmod(socketPath, OWNER_ONLY_FILE);
    attachRelease(server, lock);
    return server;
  } catch (error) {
    await lock.release();
    throw error;
  }
}

// 服务器关闭（连接点文件已被 Node 删除）之后才放锁，下一个启动者就不会撞上刚关的文件
function attachRelease(server: Server, lock: KernelLock): void {
  server.once("close", () => {
    void lock.release();
  });
}
