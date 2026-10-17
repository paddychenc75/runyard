import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  clientIdentity,
  developmentSupervisorCommand,
  packagedSupervisorCommand,
} from "./composition-root.ts";

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

describe("packaged runtime", () => {
  const resources = join(resolve("Runyard.app"), "Contents", "Resources");

  it("打包后管理进程是资源目录里的 supervisor.mjs", () => {
    expect(packagedSupervisorCommand(resources)).toEqual([
      process.execPath,
      join(resources, "runyard", "supervisor.mjs"),
    ]);
  });

  it("打包后客户端的版本和构建标识取自清单，与命令行一致", () => {
    const identity = clientIdentity({ kind: "packaged", resourcesPath: resources }, () => ({
      version: "1.2.3",
      build: "1.2.3-abcd1234",
    }));
    expect(identity).toEqual({ version: "1.2.3", build: "1.2.3-abcd1234" });
  });

  it("从源码运行时构建标识固定是 source", () => {
    expect(clientIdentity({ kind: "source", moduleUrl: "file:///x/index.mjs" }).build).toBe(
      "source",
    );
  });
});
