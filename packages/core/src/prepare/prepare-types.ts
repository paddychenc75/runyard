import type { AbsPath, Disposable } from "@runyard/platform";
import type { Requires, Runner } from "@runyard/protocol";

// 准备阶段向装配方（supervisor）要的东西：一个项目此刻的事实。
// 装配方从资源库和模板读出来交进来，core 不自己去读索引。

export type RunSubject = {
  readonly folder: AbsPath;
  readonly runner: Runner;
  /** 创建时从模板复制进项目的工具与版本范围（playground.json 的 requires） */
  readonly requires: Requires;
  /** 入口文件，替换 `{entry}`；没有入口的运行器可以不给 */
  readonly entry?: string;
  /** 项目登记的端口（索引里）；脚本没有 */
  readonly registeredPort?: number;
  /** 登记给其他项目的端口，回退时要躲开 */
  readonly otherRegisteredPorts: ReadonlySet<number>;
  /** 创建时选定的包管理器；缺省或不可用时按运行器的 variants 顺序找可用的 */
  readonly packageManager?: string;
};

/** `static` 运行的页面服务由别处提供（#50）；准备阶段只把它交给引擎，在停止时释放 */
export type StaticServer = (info: {
  readonly folder: AbsPath;
  readonly port: number;
}) => () => Promise<Disposable>;
