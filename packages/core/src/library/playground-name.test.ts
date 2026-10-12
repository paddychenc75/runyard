import { describe, expect, it } from "vitest";
import { isLibraryError } from "./library-error.ts";
import { createLibraryHarness, seedOf, user } from "./library-harness.test.ts";
import { assertValidName, nextDefaultName } from "./playground-name.ts";

const longName = (length: number) => "a".repeat(length);

async function createCode(
  name: string,
  setup?: (h: ReturnType<typeof createLibraryHarness>) => void,
) {
  const h = createLibraryHarness();
  setup?.(h);
  const library = await h.open();
  try {
    await library.create(seedOf("react19"), { name, createdBy: user });
  } catch (error) {
    if (isLibraryError(error)) return { h, code: error.error.code, params: error.error.params };
    throw error;
  }
  return { h, code: "created", params: {} };
}

describe("默认名称：模板标识加序号", () => {
  it("[LIBRARY-PLAYGROUNDS-06] 现有 react19-1 和 react19-3，下一个是 react19-4", () => {
    expect(nextDefaultName("react19", ["react19-1", "react19-3"])).toBe("react19-4");
  });

  it("[LIBRARY-PLAYGROUNDS-06] 不回头补空缺、不被别的模板和自定义名字干扰", () => {
    expect(nextDefaultName("react19", ["react19-1", "react19-2", "react19-5"])).toBe("react19-6");
    expect(nextDefaultName("react19", ["react19", "react19-x", "react19-2-b", "vue3-9"])).toBe(
      "react19-1",
    );
    expect(nextDefaultName("react19", [])).toBe("react19-1");
    // 模板标识里的连字符和点不当成正则
    expect(nextDefaultName("a.b", ["axb-4", "a.b-2"])).toBe("a.b-3");
    expect(nextDefaultName("node-ts", ["node-ts-7", "node-1"])).toBe("node-ts-8");
  });

  it("[LIBRARY-PLAYGROUNDS-06] 不给名称创建：用磁盘上现存的最大序号加一", async () => {
    const h = createLibraryHarness();
    h.fs.mkdir(h.at("react19-1"));
    h.fs.mkdir(h.at("react19-3"));
    const library = await h.open();
    const result = await library.create(seedOf("react19"), { createdBy: user });
    expect(result.name).toBe("react19-4");
    expect(h.fs.exists(h.at("react19-4", ".runyard", "playground.json"))).toBe(true);
  });

  it("[LIBRARY-PLAYGROUNDS-07] 删除后序号不复用：现存只有 react19-1，下一个是 react19-2", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    await library.create(seedOf("react19"), { createdBy: user });
    const second = await library.create(seedOf("react19"), { createdBy: user });
    expect(second.name).toBe("react19-2");
    // react19-2 被移到废纸篓：文件夹没了（索引的清理属于 #38，这里只让磁盘上的它消失）
    await h.platform.fs.trash(second.path);
    const again = await (await h.open()).create(seedOf("react19"), { createdBy: user });
    expect(again.name).toBe("react19-2");
  });
});

describe("名称规则", () => {
  it("[LIBRARY-PLAYGROUNDS-08] 64 个字符创建成功，65 个字符报 NAME_INVALID", async () => {
    expect((await createCode(longName(64))).code).toBe("created");
    const tooLong = await createCode(longName(65));
    expect(tooLong.code).toBe("NAME_INVALID");
    expect(tooLong.h.fs.exists(tooLong.h.at(longName(65)))).toBe(false);
  });

  it.each(["My App", "demo_1", "-demo", "demo-", "Demo", "演示", "a/b", ""])(
    "[LIBRARY-PLAYGROUNDS-09] %j 报 NAME_INVALID",
    async (name) => {
      expect((await createCode(name)).code).toBe("NAME_INVALID");
    },
  );

  it.each(["con", "nul", "com1", "lpt9", "prn", "aux", "com1.txt", "nul.json", "CON"])(
    "[LIBRARY-PLAYGROUNDS-10] 保留名 %j 在所有系统上报 NAME_RESERVED，没有创建任何文件夹",
    async (name) => {
      const { code, h } = await createCode(name);
      expect(code).toBe("NAME_RESERVED");
      expect(h.fs.list(h.root)).toEqual([]);
    },
  );

  it.each(["demo.", "demo ", "demo..", "x."])(
    "[LIBRARY-PLAYGROUNDS-11] 末尾是点或空格的 %j 报 NAME_INVALID，没有创建任何文件夹",
    async (name) => {
      const { code, h } = await createCode(name);
      expect(code).toBe("NAME_INVALID");
      expect(h.fs.list(h.root)).toEqual([]);
    },
  );

  it("[LIBRARY-PLAYGROUNDS-12] 重名报 NAME_EXISTS，参数是 { name }，已有项目不变", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    const first = await library.create(seedOf("react19", { "a.txt": "keep" }), {
      name: "demo",
      createdBy: user,
    });
    const before = h.fs.readFile(h.at("demo", ".runyard", "playground.json"));
    const second = await createCode("demo", (other) => {
      other.fs.mkdir(other.at("demo"));
    });
    expect(second.code).toBe("NAME_EXISTS");
    expect(second.params).toEqual({ name: "demo" });
    await expect(
      library.create(seedOf("react19", { "a.txt": "new" }), { name: "demo", createdBy: user }),
    ).rejects.toMatchObject({ error: { code: "NAME_EXISTS", params: { name: "demo" } } });
    expect(h.fs.readFile(h.at("demo", ".runyard", "playground.json"))).toBe(before);
    expect(h.fs.readFile(h.at("demo", "a.txt"))).toBe("keep");
    expect(library.find("demo")?.entry.id).toBe(first.file.id);
  });

  it("非法名称在产生任何副作用之前就被拒绝：不分配端口、不生成 id、不写文件、不动索引", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    const writes: string[] = [];
    h.fs.watch(h.root, {}, (events) => writes.push(...events.map((event) => event.path)));
    const idsBefore = h.newId();
    for (const name of ["Bad Name", "nul", "demo.", longName(65)]) {
      await expect(
        library.create(seedOf("react19"), { name, createdBy: user }),
      ).rejects.toBeDefined();
    }
    expect(h.allocations).toEqual([]);
    expect(h.newId()).toBe(`ID-${Number(idsBefore.slice(3)) + 1}`);
    expect(writes).toEqual([]);
    expect(h.fs.list(h.root)).toEqual([]);
    expect(h.fs.exists(h.indexPath)).toBe(true);
    expect(library.list()).toEqual([]);
  });

  it("默认名拼出来不合法（模板标识不合名称规则）同样被拒绝，不创建", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    await expect(library.create(seedOf("Bad Template"), { createdBy: user })).rejects.toMatchObject(
      { error: { code: "NAME_INVALID" } },
    );
    expect(h.fs.list(h.root)).toEqual([]);
  });

  it("assertValidName：合法名通过", () => {
    expect(() => assertValidName(() => null, "demo")).not.toThrow();
  });
});
