import type { StartSupervisorOptions, SupervisorHandle } from "./supervisor-options.ts";
import { closeServer, createSupervisorRuntime } from "./supervisor-runtime.ts";

// 启动顺序（决策记录 0005）：
//  1. platform.ipc.listen()：先拿内核锁，拿到才删除残留的 socket 文件并监听；别的进程持锁则抛 BUSY，
//     调用方（入口）据此安静地退出。这一步之后才可以动任何共享的东西。
//  2. 删掉上次留下的发现文件（里面是旧口令，对不上了）。
//  3. supervisor.log 轮转（超过大小就复制到 .1 再清空），然后崩溃后清理（#42 的接缝）。
//  4. 写发现文件，然后才开始接受连接：客户端没有口令就连不进来，所以第 3 步没做完时没有人能请求。
export async function startSupervisor(options: StartSupervisorOptions): Promise<SupervisorHandle> {
  const runtime = createSupervisorRuntime(options);
  const server = await options.platform.ipc.listen();
  try {
    await runtime.bootstrap(server);
  } catch (error) {
    runtime.abort();
    // 关掉服务器就放了锁，别的启动者可以接着来
    await closeServer(server);
    throw error;
  }
  return {
    endpoint: options.platform.ipc.endpoint(),
    token: runtime.token,
    api: runtime.api,
    connectionCount: runtime.connectionCount,
    closed: runtime.closed,
  };
}
