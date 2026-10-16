import { describe, expect, it } from "vitest";
import { developmentSupervisorCommand } from "./composition-root.ts";

describe("developmentSupervisorCommand", () => {
  it("从构建产物的位置往上找到仓库里管理进程的入口", () => {
    const command = developmentSupervisorCommand("file:///repo/apps/desktop/dist/main/index.mjs");
    expect(command).toEqual([process.execPath, "/repo/packages/supervisor/src/main.ts"]);
  });
});
