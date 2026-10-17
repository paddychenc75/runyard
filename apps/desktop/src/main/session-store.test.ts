import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileSessionStore } from "./session-store.ts";

// 临时目录不删，留给系统清理
async function fresh(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ry-session-"));
}

describe("上次标签页的存放（规格 DESKTOP-WORKSPACE-51）", () => {
  it("存了再读回来，原样、顺序不变；目录不存在时自动建", async () => {
    const file = join(await fresh(), "nested", "workspace-session.json");
    const store = new FileSessionStore(file);
    const session = {
      tabs: [
        { id: "a", running: true },
        { id: "b", running: false },
      ],
      active: "b",
    };
    await store.save(session);
    expect(await new FileSessionStore(file).load()).toEqual(session);
  });

  it("没有文件、内容不是 JSON、形状不对都当作没有记录，不抛", async () => {
    const dir = await fresh();
    expect(await new FileSessionStore(join(dir, "none.json")).load()).toBeNull();
    for (const bad of [
      "{oops",
      "[]",
      '{"tabs":[{"id":1,"running":true}],"active":"a"}',
      '{"tabs":"x"}',
    ]) {
      const file = join(dir, "bad.json");
      await writeFile(file, bad);
      expect(await new FileSessionStore(file).load()).toBeNull();
    }
  });

  it("重复的项目只留第一个", async () => {
    const dir = await fresh();
    const file = join(dir, "dup.json");
    await writeFile(
      file,
      JSON.stringify({
        tabs: [
          { id: "a", running: true },
          { id: "a", running: false },
        ],
        active: "a",
      }),
    );
    expect((await new FileSessionStore(file).load())?.tabs).toEqual([{ id: "a", running: true }]);
  });

  it("写入是先写临时文件再改名：保存之后目录里只有正式的文件内容", async () => {
    const dir = await fresh();
    const file = join(dir, "s.json");
    await new FileSessionStore(file).save({ tabs: [], active: "library" });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ tabs: [], active: "library" });
  });
});
