import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { developmentSupervisorCommand } from "./composition-root.ts";

describe("developmentSupervisorCommand", () => {
  it("从构建产物的位置往上找到仓库里管理进程的入口", () => {
    const repo = resolve("repo");
    const moduleUrl = pathToFileURL(
      join(repo, "apps", "desktop", "dist", "main", "index.mjs"),
    ).href;
    expect(developmentSupervisorCommand(moduleUrl)).toEqual([
      process.execPath,
      join(repo, "packages", "supervisor", "src", "main.ts"),
    ]);
  });
});
