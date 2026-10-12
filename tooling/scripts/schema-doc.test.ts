import { describe, expect, it } from "vitest";
import { z } from "zod";
import { constraints, convert, fieldsTable, typeText } from "./schema-doc.ts";

const text = (schema: z.ZodType) => typeText(convert(schema, "output").schema);

describe("schema-doc：zod 到类型文字", () => {
  it("基本类型、枚举、可空、数组", () => {
    expect(text(z.string())).toBe("string");
    expect(text(z.number().int())).toBe("integer");
    expect(text(z.enum(["a", "b"]))).toBe("'a' | 'b'");
    expect(text(z.string().nullable())).toBe("string | null");
    expect(text(z.array(z.string()))).toBe("string[]");
    expect(text(z.array(z.enum(["a", "b"])))).toBe("('a' | 'b')[]");
  });

  it("对象里可选字段带问号，record 写成 Record", () => {
    expect(text(z.object({ a: z.string(), b: z.number().optional() }))).toBe(
      "{ a: string; b?: number }",
    );
    expect(text(z.record(z.string(), z.boolean()))).toBe("Record<string, boolean>");
    expect(text(z.object({}))).toBe("{}");
  });

  it("没有类型信息的写成“任意”，有名字（meta.id）的写成名字", () => {
    expect(text(z.unknown())).toBe("任意");
    expect(text(z.object({ x: z.string() }).meta({ id: "Named" }))).toBe("Named");
  });

  it("约束写进说明：非空、范围、格式；整数的安全上下界不写", () => {
    const fieldOf = (schema: z.ZodType) => {
      const { schema: json } = convert(z.object({ f: schema }), "input");
      return json.properties?.f ?? {};
    };
    expect(constraints(fieldOf(z.string().min(1)))).toEqual(["非空"]);
    expect(constraints(fieldOf(z.number().int().min(1).max(65535)))).toEqual(["≥ 1", "≤ 65535"]);
    expect(constraints(fieldOf(z.number().int()))).toEqual([]);
    expect(constraints(fieldOf(z.number().positive()))).toEqual(["> 0"]);
    expect(constraints(fieldOf(z.string().startsWith("http://127.0.0.1:")))[0]).toContain(
      "http://127.0.0.1:",
    );
  });
});

describe("schema-doc：字段表", () => {
  it("对象写字段表，带必填和说明；表格里的竖线被转义", () => {
    const { schema, defs } = convert(
      z.object({ a: z.enum(["x", "y"]).describe("第一个"), b: z.number().optional() }),
      "input",
    );
    const table = fieldsTable(schema, defs);
    expect(table).toContain("| `a` | `'x' \\| 'y'` | 是 | 第一个 |");
    expect(table).toContain("| `b` | `number` | 否 |");
  });

  it("空对象写“无字段”，非对象写一行类型，有名字的类型只写名字", () => {
    expect(fieldsTable(...pair(z.object({})))).toContain("无字段");
    expect(fieldsTable(...pair(z.array(z.string())))).toBe("类型 `string[]`");
    expect(fieldsTable(...pair(z.object({ a: z.string() }).meta({ id: "N1" })))).toBe("类型 `N1`");
  });

  it("联合类型的每个分支一张表，分支名取固定值的字段", () => {
    const union = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("a"), x: z.string() }),
      z.object({ kind: z.literal("b") }),
    ]);
    const table = fieldsTable(...pair(union));
    expect(table).toContain("**`kind = 'a'`**");
    expect(table).toContain("**`kind = 'b'`**");
    expect(table).toContain("| `x` | `string` | 是 |");
  });
});

function pair(
  schema: z.ZodType,
): [ReturnType<typeof convert>["schema"], ReturnType<typeof convert>["defs"]] {
  const { schema: json, defs } = convert(schema, "output");
  return [json, defs];
}
