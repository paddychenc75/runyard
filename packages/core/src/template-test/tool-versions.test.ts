import { absPath } from "@runyard/platform";
import { expect, it } from "vitest";
import {
  createToolchainHarness,
  definitions,
  project,
  resolveWith,
} from "../toolchain/toolchain-harness.test.ts";
import { requestedToolPaths } from "./tool-versions.ts";

it("[TEMPLATES-FORMAT-49] 从现有候选选择所需版本，不改变默认路径", async () => {
  const h = createToolchainHarness();
  h.fake.tools.install("node", { version: "24.21.0", path: absPath("/fake/node24") });
  h.fake.tools.install("node", { version: "22.18.0", path: absPath("/fake/node22") });
  const result = await resolveWith(
    h,
    requestedToolPaths(
      h.fake.platform,
      h.fake.clock,
      definitions,
      project,
      { node: "22.18.0" },
      {},
    ),
  );
  expect(result.node).toBe("/fake/node22");
});
it("[TEMPLATES-FORMAT-49] 指定版本不存在时TOOL_MISSING，不以其他版本冒充", async () => {
  const h = createToolchainHarness();
  h.fake.tools.install("node", { version: "24.21.0" });
  const checked = requestedToolPaths(
    h.fake.platform,
    h.fake.clock,
    definitions,
    project,
    { node: "22.18.0" },
    {},
  ).catch((error) => error);
  const outcome = await resolveWith(h, checked);
  expect(outcome).toMatchObject({
    error: { code: "TOOL_MISSING", params: { tool: "node", required: "22.18.0" } },
  });
});
