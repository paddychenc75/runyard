// 进程死亡时由内核释放的锁。拿到锁的才许删除残留的 socket 文件并监听（决策记录 0005）。
// 不用“锁文件里写进程号再判断是否过期”：判断和抢锁之间有空档，进程号还会被复用。

export interface KernelLock {
  /** 释放后别的进程立刻能拿到；重复调用无副作用 */
  release(): Promise<void>;
}

export interface LockStrategy {
  /** 拿到返回锁；别的进程持有返回 null；其他失败（权限、磁盘）抛出原始错误 */
  acquire(): Promise<KernelLock | null>;
}
