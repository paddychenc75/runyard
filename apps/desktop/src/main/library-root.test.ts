import { describe, expect, it } from "vitest";
import { displayPath } from "./library-root.ts";

describe("资源库路径的显示写法", () => {
  it("主目录里的路径缩成 ~/…，主目录本身是 ~", () => {
    expect(displayPath("/home/u/Runyard", "/home/u")).toBe("~/Runyard");
    expect(displayPath("/home/u/Runyard", "/home/u/")).toBe("~/Runyard");
    expect(displayPath("/home/u", "/home/u")).toBe("~");
  });

  it("别处的路径原样，名字相近的兄弟目录不被误缩", () => {
    expect(displayPath("/Volumes/data/Runyard", "/home/u")).toBe("/Volumes/data/Runyard");
    expect(displayPath("/home/user2/Runyard", "/home/u")).toBe("/home/user2/Runyard");
  });
});
