// 一次只放一个任务进来，按到达顺序排队。读-改-写共享文件的方法都走它：
// 命令行和应用同时请求时，两个请求不会交错着写同一个文件（同一个管理进程里写入只有一个来源）。
export interface AsyncMutex {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createAsyncMutex(): AsyncMutex {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task, task);
      // 前一个任务失败不能让后面的排不上队
      tail = result.catch(() => {});
      return result;
    },
  };
}
