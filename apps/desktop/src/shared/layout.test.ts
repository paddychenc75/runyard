import { describe, expect, it } from "vitest";
import { LIST_WIDTH_PX, previewBounds } from "./layout.ts";

describe("previewBounds", () => {
  it("预览占列表右边的整块，窗口窄到放不下时宽度为 0", () => {
    expect(previewBounds({ width: 1200, height: 700 })).toEqual({
      x: LIST_WIDTH_PX,
      y: 0,
      width: 1200 - LIST_WIDTH_PX,
      height: 700,
    });
    expect(previewBounds({ width: 100, height: 700 }).width).toBe(0);
  });
});
