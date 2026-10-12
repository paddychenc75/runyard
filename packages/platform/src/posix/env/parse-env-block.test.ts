import { describe, expect, it } from "vitest";
import { dropSessionVariables, findBlock, parseEnvBlock } from "./parse-env-block.ts";

const START = "__RUNYARD_ENV_aaaa_START__";
const END = "__RUNYARD_ENV_aaaa_END__";
const entries = (...pairs: string[]) => Buffer.from(pairs.map((pair) => `${pair}\0`).join(""));
const wrap = (body: Buffer | string, before = "", after = "") =>
  Buffer.concat([
    Buffer.from(before),
    Buffer.from(START),
    Buffer.from(body),
    Buffer.from(END),
    Buffer.from(after),
  ]);

describe("findBlock：标记之间的字节", () => {
  it("忽略标记前后的杂音（含没有换行结尾的输出）", () => {
    const output = wrap(entries("A=1"), "welcome back", "goodbye");
    expect(findBlock(output, START, END)?.toString()).toBe("A=1\0");
  });

  it("忽略主题的转义序列（标题、颜色、光标）", () => {
    const noise = "\u001b]0;title\u0007\u001b[31mred\u001b[0m\u001b[?2004h";
    const output = wrap(entries("A=1"), noise, noise);
    expect(parseEnvBlock(findBlock(output, START, END) as Buffer).env).toEqual({ A: "1" });
  });

  it("别的随机数的标记不算标记", () => {
    const fake = "__RUNYARD_ENV_bbbb_START__ x __RUNYARD_ENV_bbbb_END__";
    const output = wrap(entries("A=1"), `${fake}\n`, fake);
    expect(parseEnvBlock(findBlock(output, START, END) as Buffer).env).toEqual({ A: "1" });
  });

  it("取第一个起始标记和它之后第一个结束标记", () => {
    const output = Buffer.from(`${END}junk${START}A=1\0${END}${START}B=2\0${END}`);
    expect(findBlock(output, START, END)?.toString()).toBe("A=1\0");
  });

  it("只有起始标记、还没有结束标记时返回 null（继续等）", () => {
    expect(findBlock(Buffer.from(`${START}A=1\0`), START, END)).toBeNull();
    expect(findBlock(Buffer.from("nothing"), START, END)).toBeNull();
  });

  it("结束标记在起始标记之前不算", () => {
    expect(findBlock(Buffer.from(`${END}${START}A=1\0`), START, END)).toBeNull();
  });
});

describe("parseEnvBlock：按 NUL 分隔、首个等号切键值", () => {
  it("值里的换行、等号、标记前缀完整保留", () => {
    const value = `line1\nline2 ${START.slice(0, 12)}\n=tail`;
    const { env } = parseEnvBlock(entries(`MULTI=${value}`, "PATH=/usr/bin"));
    expect(env.MULTI).toBe(value);
    expect(env.PATH).toBe("/usr/bin");
  });

  it("空值保留；没有等号或键为空的条目不是变量", () => {
    const { env } = parseEnvBlock(entries("EMPTY=", "garbage", "=nokey", "OK=1"));
    expect(env).toEqual({ EMPTY: "", OK: "1" });
  });

  it("很大的值（800 KB）和很多变量（5000 个）", () => {
    const huge = "x".repeat(800 * 1024);
    const many = Array.from({ length: 5000 }, (_, i) => `V${i}=${i}`);
    const { env } = parseEnvBlock(entries(`HUGE=${huge}`, ...many));
    expect(env.HUGE).toHaveLength(huge.length);
    expect(Object.keys(env)).toHaveLength(5001);
  });

  it("非 UTF-8 字节：该值被替换成 U+FFFD 并标记有损，其余变量不受影响", () => {
    const block = Buffer.concat([
      Buffer.from("BAD=a"),
      Buffer.from([0xff]),
      Buffer.from("b\0GOOD=é\0"),
    ]);
    const parsed = parseEnvBlock(block);
    expect(parsed.env.BAD).toBe("a�b");
    expect(parsed.env.GOOD).toBe("é");
    expect(parsed.lossy).toBe(true);
  });

  it("全是合法 UTF-8 时不标有损", () => {
    expect(parseEnvBlock(entries("A=中文")).lossy).toBe(false);
  });

  it("去掉会话专属的变量", () => {
    const env = dropSessionVariables({
      PWD: "/x",
      OLDPWD: "/y",
      SHLVL: "2",
      _: "/usr/bin/env",
      RUNYARD_RESOLVING_ENV: "1",
      PATH: "/bin",
    });
    expect(env).toEqual({ PATH: "/bin" });
  });
});
