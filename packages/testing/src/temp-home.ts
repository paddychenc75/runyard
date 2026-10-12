import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AbsPath, absPath } from "@runyard/platform";

export interface TempHome {
  /** 这次测试自己的“主目录”，在系统临时目录下，名字以 runyard-test- 开头 */
  readonly home: AbsPath;
  /** 对应 `~/.runyard`，已建好 */
  readonly stateDir: AbsPath;
  /** 对应 `~/Runyard`，已建好 */
  readonly library: AbsPath;
  /** 删掉整个临时主目录；可以重复调用 */
  dispose(): void;
}

// 需要真实目录的集成式测试用它：怎样把家目录换成临时目录的答案是“显式传参”——
// 平台层的 home 选项（getPlatform / createFakePlatform 的 home），不读环境变量，
// 这样并行的测试互不影响，也没有“忘了设环境变量就写进真实目录”的路径。
export function createTempHome(): TempHome {
  // realpath：macOS 的 /var 是 /private/var 的链接，路径比较和监视都要用真实路径
  const home = absPath(realpathSync(mkdtempSync(join(tmpdir(), "runyard-test-"))));
  const stateDir = absPath(join(home, ".runyard"));
  const library = absPath(join(home, "Runyard"));
  mkdirSync(stateDir);
  mkdirSync(library);
  return { home, stateDir, library, dispose: () => rmSync(home, { recursive: true, force: true }) };
}
