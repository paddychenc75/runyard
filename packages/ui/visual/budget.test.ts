import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBudget, listBaselines, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from "./budget.ts";

describe("基准图的体积预算", () => {
  it("单张超过 200 KB 就报，刚好 200 KB 不报", () => {
    expect(checkBudget([{ name: "a.png", bytes: MAX_FILE_BYTES }])).toEqual([]);
    const errors = checkBudget([{ name: "Big.png", bytes: MAX_FILE_BYTES + 1 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Big.png");
  });

  it("总量超过 30 MB 就报", () => {
    const files = Array.from({ length: 160 }, (_, index) => ({
      name: `f${index}.png`,
      bytes: Math.ceil(MAX_TOTAL_BYTES / 150),
    }));
    expect(checkBudget(files).some((error) => error.includes("30 MB"))).toBe(true);
  });

  it("目录里混进不是 PNG 的文件也报", () => {
    expect(checkBudget([{ name: "note.txt", bytes: 10 }])[0]).toContain("PNG");
  });

  it("提交进仓库的基准图在预算之内", () => {
    const files = listBaselines(join(import.meta.dirname, "__screenshots__"));
    expect(checkBudget(files)).toEqual([]);
  });
});
