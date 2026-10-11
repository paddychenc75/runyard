import { describe, expect, it } from "vitest";
import { pickCandidates } from "./deps-lookup.ts";

describe("deps-lookup", () => {
  it("只取稳定版本，按发布时间从新到旧，并算出天数", () => {
    const time = {
      created: "2020-01-01T00:00:00.000Z",
      modified: "2026-10-01T00:00:00.000Z",
      "1.0.0": "2026-09-01T00:00:00.000Z",
      "1.1.0-beta.1": "2026-09-20T00:00:00.000Z",
      "1.1.0": "2026-09-24T12:00:00.000Z",
    };
    const result = pickCandidates(time, new Date("2026-10-12T00:00:00Z"));
    expect(result.map((c) => c.version)).toEqual(["1.1.0", "1.0.0"]);
    expect(result[0]).toEqual({ version: "1.1.0", released: "2026-09-24", ageDays: 17 });
  });

  it("最多返回 limit 个", () => {
    const time = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [
        `1.0.${i}`,
        `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      ]),
    );
    expect(pickCandidates(time, new Date("2026-10-12T00:00:00Z"))).toHaveLength(10);
  });
});
