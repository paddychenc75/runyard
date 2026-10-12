import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { absPath, type PosixRelPath, posixRelPath } from "../path-types.ts";
import type { WatchEvent } from "../platform.ts";
import type { ContractContext } from "./context.ts";
import { eventually } from "./service-harness.ts";

// 只等可观察的条件，不睡固定时间。“不该出现的事件没出现”靠一个后发生的哨兵事件证明：
// 同一个监听的事件按发生的先后到达，哨兵到了，它前面发生的事件要是会来就已经来了
const WAIT_MS = 30_000;

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

  describe("watch", () => {
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
      await eventually(
        () => has(seen, "add", "keep/y.txt"),
        WAIT_MS,
        "没被忽略的文件的事件（哨兵）",
      );
      expect(seen.filter((event) => event.path.startsWith("skip"))).toEqual([]);
      await handle.dispose();
    });

    it('"watch" depth 为 1 时只看根目录的直接子项', async () => {
      const { root, seen, handle } = await setup({ depth: 1 });
      await fs.makeDir(absPath(join(root, "sub")));
      await fs.writeFile(absPath(join(root, "top.txt")), "1");
      await eventually(() => has(seen, "add", "top.txt"), WAIT_MS, "直接子项的事件");
      await fs.writeFile(absPath(join(root, "sub", "deep.txt")), "1");
      await fs.writeFile(absPath(join(root, "sentinel.txt")), "1");
      await eventually(() => has(seen, "add", "sentinel.txt"), WAIT_MS, "哨兵文件的事件");
      expect(has(seen, "add", "sub/deep.txt")).toBe(false);
      await handle.dispose();
    });

    it('"watch" dispose 返回之后不再有回调', async () => {
      const { root, seen, handle } = await setup();
      await fs.writeFile(absPath(join(root, "a.txt")), "1");
      await eventually(() => has(seen, "add", "a.txt"), WAIT_MS, "dispose 前的事件");
      // 另开一个监听当哨兵：它看到了 b.txt，说明 b.txt 的事件已经发出过，而被 dispose 的那个一个都没收到
      const sentinel: WatchEvent[] = [];
      const control = await watch(root, {}, (events) => sentinel.push(...events));
      await handle.dispose();
      const count = seen.length;
      await fs.writeFile(absPath(join(root, "b.txt")), "1");
      await eventually(() => has(sentinel, "add", "b.txt"), WAIT_MS, "哨兵监听看到 b.txt");
      expect(seen.length).toBe(count);
      await control.dispose();
    });
  });
}
