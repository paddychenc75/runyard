import { describe, expect, it } from "vitest";
import { developmentConfig, packagedConfig } from "./composition-root.ts";

const MODULE = "file:///Applications/Runyard.app/Contents/Resources/runyard/cli.mjs";
const MANIFEST = { version: "1.2.3", build: "1.2.3-abcd1234" };

describe("packagedConfig", () => {
  it("版本和构建标识取自清单，也就是应用的版本", () => {
    const config = packagedConfig(MODULE, MANIFEST);
    expect(config.version).toBe("1.2.3");
    expect(config.build).toBe("1.2.3-abcd1234");
    expect(config.install).toEqual({
      kind: "app",
      version: "1.2.3",
      path: "/Applications/Runyard.app/Contents/Resources/bin/runyard",
    });
  });

  it("管理进程用应用自带的运行时当 Node 跑，入口和模板数据在资源目录里", () => {
    const config = packagedConfig(MODULE, MANIFEST);
    expect(config.supervisorCommand).toEqual([
      process.execPath,
      "/Applications/Runyard.app/Contents/Resources/runyard/supervisor.mjs",
    ]);
    expect(config.supervisorEnv).toEqual({ ELECTRON_RUN_AS_NODE: "1" });
    expect(config.supervisorHost).toBe("electron");
    expect(config.templates).toEqual({
      builtinDir: "/Applications/Runyard.app/Contents/Resources/runyard/templates/builtin",
      runnersDir: "/Applications/Runyard.app/Contents/Resources/runyard/templates/runners",
      toolsDir: "/Applications/Runyard.app/Contents/Resources/runyard/templates/tools",
    });
  });

  it("从源码运行的配置仍是系统的 Node，不带 ELECTRON_RUN_AS_NODE", () => {
    const config = developmentConfig();
    expect(config.supervisorHost).toBe("node");
    expect(config.supervisorEnv).toEqual({});
    expect(config.install.kind).toBe("source");
  });
});
