import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { absPath, type PosixRelPath, posixRelPath } from "../path-types.ts";
import type { WatchEvent } from "../platform.ts";
import type { ContractContext } from "./context.ts";
import { eventually } from "./service-harness.ts";

const WAIT_MS = 10_000;
// 证明“之后没有回调”需要等一小段真实时间：事件批的攒集窗口是 30 毫秒，等它的几倍
const QUIET_MS = 200;
const quiet = () => new Promise((resolve) => setTimeout(resolve, QUIET_MS));

// watch 的契约。真实现用 chokidar 监听真目录，假平台同步通知；用例只靠“最终看到什么事件”判断，两边都成立
export function watchContract(ctx: ContractContext): void {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "runyard-contract-watch-")));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  const { fs, watch } = ctx.create(home);
  let counter = 0;

  async function setup(opts: { ignore?: PosixRelPath[]; depth?: number } = {}) {
    const base = absPath(join(home, `case-${++counter}`));
    const root = absPath(join(base, "root"));
    await fs.makeDir(root);
    const seen: WatchEvent[] = [];
    const handle = await watch(root, opts, (events) => seen.push(...events));
    return { base, root, seen, handle };
  }
  const has = (seen: WatchEvent[], kind: WatchEvent["kind"], path: string) =>
    seen.some((event) => event.kind === kind && event.path === path);

  // 等事件最多 10 秒，所以用例的超时要放宽（默认 5 秒会先到）
  describe("watch", { timeout: 30_000 }, () => {
    it('"watch" 新建、修改、移走文件各报一次对应的事件，路径相对根目录、用 /', async () => {
      const { base, root, seen, handle } = await setup();
      await fs.makeDir(absPath(join(root, "sub")));
      await fs.writeFile(absPath(join(root, "sub", "a.txt")), "1");
      await eventually(() => has(seen, "add", "sub/a.txt"), WAIT_MS, "新建文件的事件");
      await fs.writeFile(absPath(join(root, "sub", "a.txt")), "2");
      await eventually(() => has(seen, "change", "sub/a.txt"), WAIT_MS, "修改文件的事件");
      await fs.renameFile(absPath(join(root, "sub", "a.txt")), absPath(join(base, "away.txt")));
      await eventually(() => has(seen, "remove", "sub/a.txt"), WAIT_MS, "移走文件的事件");
      await handle.dispose();
    });

    it('"watch" 忽略列表里的子路径，其下的变化不报告', async () => {
      const { root, seen, handle } = await setup({ ignore: [posixRelPath("skip")] });
      await fs.makeDir(absPath(join(root, "skip")));
      await fs.makeDir(absPath(join(root, "keep")));
      await fs.writeFile(absPath(join(root, "skip", "x.txt")), "1");
      await fs.writeFile(absPath(join(root, "keep", "y.txt")), "1");
      await eventually(() => has(seen, "add", "keep/y.txt"), WAIT_MS, "没被忽略的文件的事件");
      await quiet();
      expect(seen.filter((event) => event.path.startsWith("skip"))).toEqual([]);
      await handle.dispose();
    });

    it('"watch" depth 为 1 时只看根目录的直接子项', async () => {
      const { root, seen, handle } = await setup({ depth: 1 });
      await fs.makeDir(absPath(join(root, "sub")));
      await fs.writeFile(absPath(join(root, "top.txt")), "1");
      await eventually(() => has(seen, "add", "top.txt"), WAIT_MS, "直接子项的事件");
      await fs.writeFile(absPath(join(root, "sub", "deep.txt")), "1");
      await quiet();
      expect(has(seen, "add", "sub/deep.txt")).toBe(false);
      await handle.dispose();
    });

    it('"watch" dispose 返回之后不再有回调', async () => {
      const { root, seen, handle } = await setup();
      await fs.writeFile(absPath(join(root, "a.txt")), "1");
      await eventually(() => has(seen, "add", "a.txt"), WAIT_MS, "dispose 前的事件");
      await handle.dispose();
      const count = seen.length;
      await fs.writeFile(absPath(join(root, "b.txt")), "1");
      await quiet();
      expect(seen.length).toBe(count);
    });
  });
}
