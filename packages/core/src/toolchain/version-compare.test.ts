import { describe, expect, it } from "vitest";
import { judgeVersion, parseVersionNumbers } from "./version-compare.ts";

describe("parseVersionNumbers", () => {
  it("取开头的 1 到 3 段数字，忽略后缀", () => {
    expect(parseVersionNumbers("24.21.0")).toEqual([24, 21, 0]);
    expect(parseVersionNumbers("1.26")).toEqual([1, 26]);
    expect(parseVersionNumbers("3.12.4rc1")).toEqual([3, 12, 4]);
  });
  it("开头不是数字就解析不出", () => {
    expect(parseVersionNumbers("v24.0.0")).toBeNull();
    expect(parseVersionNumbers("")).toBeNull();
  });
});

describe("judgeVersion", () => {
  const range = ">=20.19 <27";
  it("低于下限是 too-old，边界上的版本通过", () => {
    expect(judgeVersion(range, "20.10.0")).toBe("too-old");
    expect(judgeVersion(range, "20.18.9")).toBe("too-old");
    expect(judgeVersion(range, "20.19.0")).toBe("ok");
    expect(judgeVersion(range, "20.19")).toBe("ok");
  });
  it("到达上限（含上限本身的 27.0.0）是 untested，上限之下通过", () => {
    expect(judgeVersion(range, "26.9.9")).toBe("ok");
    expect(judgeVersion(range, "27.0.0")).toBe("untested");
    expect(judgeVersion(range, "28.0.0")).toBe("untested");
  });
  it("只比范围里写了的那几段", () => {
    expect(judgeVersion(">=22.18", "22.18.3")).toBe("ok");
    expect(judgeVersion(">=22", "22.0.1")).toBe("ok");
    expect(judgeVersion("<=27", "27.3.0")).toBe("ok");
    expect(judgeVersion(">22", "22.5.0")).toBe("too-old");
    expect(judgeVersion(">22", "23.0.0")).toBe("ok");
  });
  it("没有上限的范围不会有 untested", () => {
    expect(judgeVersion(">=3.12", "9.0.0")).toBe("ok");
  });
  it("范围写法错误时不拦人", () => {
    expect(judgeVersion("^22", "1.0.0")).toBe("ok");
  });
});
