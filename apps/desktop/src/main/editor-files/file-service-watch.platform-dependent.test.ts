import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeTestProject, PROJECT } from "./test-project.ts";

// 监听用真实的平台层 watch（chokidar）：规格要求文件树在 2 秒内更新

const WITHIN_SPEC_MS = 2000;
const poll = { timeout: WITHIN_SPEC_MS, interval: 20 };

// 开始监听之前写的文件，系统可能晚一点才把它的事件送来。再写一个记号文件：事件按顺序到，
// 记号的事件到了，前面的就都到过了，然后清空记录，之后的断言只看自己造成的变化
async function settle(p: ReturnType<typeof makeTestProject>): Promise<void> {
  writeFileSync(p.at("settled.marker"), "x");
  await expect.poll(() => p.changes.some((c) => c.path === "settled.marker"), poll).toBe(true);
  p.changes.length = 0;
}

describe("监听项目文件夹", () => {
  it("[DESKTOP-EDITOR-03] 命令行新建 src/new.ts 并删除 src/old.ts：2 秒内收到新增和删除的变化", async () => {
    const p = makeTestProject();
    p.put("src/old.ts", "old");
    expect(await p.service.watch(PROJECT)).toEqual({ ok: true, value: null });
    writeFileSync(p.at("src/new.ts"), "new");
    unlinkSync(p.at("src/old.ts"));
    await expect
      .poll(() => p.changes.map((c) => `${c.kind}:${c.path}`), poll)
      .toEqual(expect.arrayContaining(["add:src/new.ts", "remove:src/old.ts"]));
    expect(p.changes.every((c) => !c.self)).toBe(true);
    await p.service.dispose();
  });

  it("不报告 .git、.runyard、根目录和嵌套的 node_modules 里的变化；其余照常报告", async () => {
    const p = makeTestProject();
    for (const dir of [".git", ".runyard", "node_modules", "src/node_modules", "src/.git"]) {
      mkdirSync(p.at(dir), { recursive: true });
    }
    await p.service.watch(PROJECT);
    for (const rel of [
      ".git/HEAD",
      ".runyard/state.json",
      "node_modules/x.js",
      "src/node_modules/y.js",
      "src/.git/z",
    ]) {
      writeFileSync(p.at(rel), "x");
    }
    // visible.ts 最后写，它的事件到了，说明前面的事件都已处理过
    writeFileSync(p.at("visible.ts"), "x");
    await expect.poll(() => p.changes.map((c) => c.path), poll).toContain("visible.ts");
    expect(new Set(p.changes.map((c) => c.path))).toEqual(new Set(["visible.ts"]));
    await p.service.dispose();
  });

  it("[DESKTOP-EDITOR-36] 自己保存连续 5 次：没有一次变化被当成外部修改", async () => {
    const p = makeTestProject();
    p.put("App.tsx", "v0");
    await p.service.watch(PROJECT);
    await settle(p);
    for (let i = 1; i <= 5; i++) {
      expect((await p.service.write(PROJECT, "App.tsx", `v${i}`)).ok).toBe(true);
    }
    // 系统可能把紧挨着的几次写入合成一个事件，所以不要求“一次保存一个事件”；
    // 记号文件的事件到了，说明前面的保存引起的事件都已处理完
    writeFileSync(p.at("done.marker"), "x");
    await expect.poll(() => p.changes.some((c) => c.path === "done.marker"), poll).toBe(true);
    const mine = p.changes.filter((c) => c.path !== "done.marker");
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((c) => c.path === "App.tsx" && c.self)).toBe(true);
    await p.service.dispose();
  });

  it("[DESKTOP-EDITOR-36] 自己保存之后外部程序改成别的内容：这次变化不被当成自己的", async () => {
    const p = makeTestProject();
    p.put("App.tsx", "v0");
    await p.service.watch(PROJECT);
    await settle(p);
    await p.service.write(PROJECT, "App.tsx", "mine");
    const appChanges = () => p.changes.filter((c) => c.path === "App.tsx" && c.kind !== "remove");
    await expect.poll(() => appChanges().length, poll).toBeGreaterThanOrEqual(1);
    expect(appChanges().every((c) => c.self)).toBe(true);
    const seen = appChanges().length;
    // 外部程序（智能体常见的写法）也是先写临时文件再改名盖掉：Linux 的 inotify 盯着文件本身，
    // 自己的原子保存换掉文件后，原地改写可能漏报，改名式写入两个系统都报得出来（macOS 为正式目标）
    writeFileSync(p.at("other.tmp"), "theirs");
    renameSync(p.at("other.tmp"), p.at("App.tsx"));
    await expect.poll(() => appChanges().length, poll).toBeGreaterThan(seen);
    expect(appChanges().at(-1)?.self).toBe(false);
    await p.service.dispose();
  });

  it("重复 watch 不会重复推送；unwatch 之后不再有变化推来", async () => {
    const p = makeTestProject();
    await p.service.watch(PROJECT);
    await p.service.watch(PROJECT);
    writeFileSync(p.at("a.ts"), "x");
    await expect.poll(() => p.changes.length, poll).toBeGreaterThan(0);
    expect(p.changes.filter((c) => c.path === "a.ts" && c.kind === "add")).toHaveLength(1);
    await p.service.unwatch(PROJECT);
    const seen = p.changes.length;
    writeFileSync(p.at("b.ts"), "x");
    // 取消监听后再等一段远长于批处理间隔的时间，仍应没有新变化（等“没有发生”只能给个窗口）
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(p.changes.length).toBe(seen);
  });
});
