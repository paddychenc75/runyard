// 进程表的读取方式。proc 的算法（认身份、整组停止）只依赖这个接口，
// 各系统只负责“怎么读”：macOS 用 ps，Linux 读 /proc（决策记录 0006）。

export interface ProcessEntry {
  readonly pid: number;
  /** 进程组号；spawn 出来的根进程自成一组，组号等于它的 pid */
  readonly pgid: number;
  /** 启动时间，毫秒。起点由系统决定，只用来比较是否相等或先后，不做别的算术 */
  readonly startTime: number;
}

export interface ProcessSource {
  /** 整张进程表，一次调用 */
  snapshot(): Promise<ProcessEntry[]>;
  /** 单个进程的启动时间；进程不存在返回 null */
  startTime(pid: number): Promise<number | null>;
  /**
   * 环境里带 name=value 的进程（同一用户、读得到环境的）。进程表其余信息一并给出，
   * 好让调用方核对身份。macOS 与 Linux 读环境的办法不同，精度也不同，见各自的实现
   */
  findByEnv(name: string, value: string): Promise<ProcessEntry[]>;
  /**
   * 与 pid 共用同一个控制终端的进程（含 pid 自己）。pid 不存在或没有控制终端返回空数组。
   * 控制终端一旦随会话首进程退出就不再认这些进程，所以只能在会话首进程还活着时问
   */
  terminalPeers(pid: number): Promise<ProcessEntry[]>;
  /** 同步版本：只给 spawn 用，因为 ManagedProcess.ref 是同步返回的 */
  startTimeSync(pid: number): number | null;
}
