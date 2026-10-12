import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  canWrite,
  defineFileFormat,
  quarantineFileName,
  readVersioned,
  readVersionedText,
  serializeVersioned,
} from "./file-format.ts";

// 假的三版格式，用来演练升级链：
// v1 { formatVersion, title }；v2 把 title 改名为 name；v3 加 tags（默认空数组）
const v3Schema = z.looseObject({
  formatVersion: z.literal(3),
  name: z.string(),
  tags: z.array(z.string()),
});
const fake = defineFileFormat({
  name: "fake.json",
  currentVersion: 3,
  schema: v3Schema,
  migrations: {
    1: ({ title, ...rest }) => ({ ...rest, name: title }),
    2: (old) => ({ ...old, tags: [] }),
  },
  recovery: "defaults",
});

describe("升级链", () => {
  it("v1 经 v2 升到 v3，旧文件里的未知字段保留，并标出原来的版本", () => {
    const result = readVersioned(fake, { formatVersion: 1, title: "demo", extra: 7 });
    expect(result).toEqual({
      status: "ok",
      upgradedFrom: 1,
      value: { formatVersion: 3, name: "demo", tags: [], extra: 7 },
    });
  });

  it("已经是最新版本的不标 upgradedFrom", () => {
    const result = readVersioned(fake, { formatVersion: 3, name: "a", tags: ["x"] });
    expect(result).toEqual({ status: "ok", value: { formatVersion: 3, name: "a", tags: ["x"] } });
  });

  it("从中间的版本开始只走剩下的几步", () => {
    const result = readVersioned(fake, { formatVersion: 2, name: "b" });
    expect(result.status === "ok" && result.upgradedFrom).toBe(2);
  });

  it("迁移函数拿到的是副本，即使它原地修改，调用方手里的原始数据也不被改动", () => {
    const mutating = defineFileFormat({
      name: "mutating.json",
      currentVersion: 2,
      schema: z.object({ formatVersion: z.literal(2), name: z.string() }),
      migrations: {
        1: (old) => {
          old.name = old.title;
          delete old.title;
          return old;
        },
      },
      recovery: "defaults",
    });
    const raw = { formatVersion: 1, title: "demo" };
    expect(readVersioned(mutating, raw).status).toBe("ok");
    expect(raw).toEqual({ formatVersion: 1, title: "demo" });
  });

  it("迁移函数忘了写 formatVersion 也没关系，由框架盖章", () => {
    const result = readVersioned(fake, { formatVersion: 1, title: "x" });
    expect(result.status === "ok" && result.value.formatVersion).toBe(3);
  });

  it("升级后序列化得到最新版本的文件，再读回来得到同一份数据（往返）", () => {
    const first = readVersioned(fake, { formatVersion: 1, title: "demo", extra: 7 });
    if (first.status !== "ok") throw new Error("expected ok");
    const text = serializeVersioned(fake, first.value);
    expect(text.endsWith("\n")).toBe(true);
    const second = readVersionedText(fake, text);
    expect(second).toEqual({ status: "ok", value: first.value });
  });

  it("迁移函数抛错按损坏处理，并带着出错的那一步", () => {
    const broken = defineFileFormat({
      name: "broken.json",
      currentVersion: 2,
      schema: z.object({ formatVersion: z.literal(2) }),
      migrations: {
        1: () => {
          throw new Error("boom");
        },
      },
      recovery: "rescan",
    });
    const result = readVersioned(broken, { formatVersion: 1 });
    expect(result).toMatchObject({
      status: "corrupt",
      reason: "migration-failed",
      recovery: "rescan",
    });
    expect(result.status === "corrupt" && result.details[0]).toContain("v1");
  });

  it("定义格式时升级链必须恰好覆盖 v1 到 vN-1", () => {
    const schema = z.object({ formatVersion: z.literal(3) });
    const base = { name: "x", currentVersion: 3, schema, recovery: "discard" } as const;
    expect(() => defineFileFormat({ ...base, migrations: { 1: (o) => o } })).toThrow();
    expect(() => defineFileFormat({ ...base, migrations: { 1: (o) => o, 3: (o) => o } })).toThrow();
    expect(() => defineFileFormat({ ...base, currentVersion: 0, migrations: {} })).toThrow();
  });
});

describe("读到更新版本的文件", () => {
  const future = { formatVersion: 4, name: "n", tags: [], brandNew: { a: 1 } };

  it("返回 newer 和只读标记，带上文件版本与程序认识的版本，不解析内容", () => {
    const result = readVersioned(fake, future);
    expect(result).toEqual({
      status: "newer",
      readOnly: true,
      fileVersion: 4,
      supportedVersion: 3,
      raw: future,
    });
  });

  it("即使内容在当前版本的眼里不合法，也只报 newer，不当作损坏", () => {
    expect(readVersioned(fake, { formatVersion: 99, whatever: true }).status).toBe("newer");
  });

  it("newer 不许写回；ok 才许写", () => {
    expect(canWrite(readVersioned(fake, future))).toBe(false);
    expect(canWrite(readVersioned(fake, { formatVersion: 3, name: "a", tags: [] }))).toBe(true);
  });

  it("读它不会改动原始数据（不降级、不重写）", () => {
    const copy = JSON.parse(JSON.stringify(future));
    readVersioned(fake, future);
    expect(future).toEqual(copy);
  });
});

describe("损坏的文件", () => {
  it.each([
    ["不是 JSON", "{oops", "not-json"],
    ["不是对象（数组）", "[1,2]", "not-object"],
    ["不是对象（null）", "null", "not-object"],
    ["没有版本号", '{"name":"a"}', "bad-version"],
    ["版本号是小数", '{"formatVersion":1.5}', "bad-version"],
    ["版本号是 0", '{"formatVersion":0}', "bad-version"],
    ["版本号是字符串", '{"formatVersion":"3"}', "bad-version"],
    ["形状不合法", '{"formatVersion":3,"name":1,"tags":[]}', "invalid"],
  ])("%s：返回 corrupt，带上文件格式规定的处理方式", (_title, text, reason) => {
    const result = readVersionedText(fake, text);
    expect(result).toMatchObject({ status: "corrupt", reason, recovery: "defaults" });
    expect(canWrite(result)).toBe(false);
  });

  it("形状不合法时 details 指出是哪个字段", () => {
    const result = readVersionedText(fake, '{"formatVersion":3,"name":1,"tags":[]}');
    expect(result.status === "corrupt" && result.details[0]).toMatch(/^name: /);
  });

  it("坏文件改名留存用的名字带时间，由调用方给时间", () => {
    expect(quarantineFileName("library.json", 1_760_000_000_000)).toBe(
      "library.json.corrupt-1760000000000",
    );
  });

  it("序列化时形状不合法的值被拒绝，不会写出坏文件", () => {
    // @ts-expect-error 故意传旧版本的值
    expect(() => serializeVersioned(fake, { formatVersion: 2, name: "a", tags: [] })).toThrow();
  });
});
