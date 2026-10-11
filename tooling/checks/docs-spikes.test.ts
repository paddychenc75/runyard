import { describe, expect, it } from "vitest";
import { listFiles } from "./docs.ts";
import { skips } from "./skips.ts";
import { makeRepo } from "./test-helpers.ts";

const SKIP = ["it", "skip"].join(".");

describe("spikes/ 不参与仓库检查", () => {
  it("listFiles 忽略 spikes/ 下的文件，只留 spikes/README.md", () => {
    const root = makeRepo({
      "spikes/README.md": "# 技术验证\n",
      "spikes/k1/README.md": "结论\n",
      "spikes/k1/src/a.test.ts": "x\n",
      "tooling/a.ts": "x\n",
    });
    expect(listFiles(root)).toEqual(["spikes/README.md", "tooling/a.ts"]);
  });

  it("同样的违规：在 spikes/ 下通过，在 tooling/ 下失败", () => {
    const bad = `${SKIP}("x", () => {});\n`;
    const inSpikes = makeRepo({ "spikes/k1/a.test.ts": bad });
    const inTooling = makeRepo({ "tooling/a.test.ts": bad });
    expect(skips.run(inSpikes)).toEqual([]);
    expect(skips.run(inTooling)).toHaveLength(1);
  });
});
