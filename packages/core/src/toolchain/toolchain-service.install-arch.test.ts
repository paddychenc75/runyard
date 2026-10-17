import { absPath } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import {
  createToolchainHarness,
  definitions,
  nodeOnly,
  resolveWith,
} from "./toolchain-harness.test.ts";
import { ToolchainService } from "./toolchain-service.ts";

// 缺工具时带上当前系统的安装方式（#228），以及设置页表里的芯片架构列（规格 DESKTOP-SETTINGS-15）

describe("工具检测结果里的安装方式（#228）", () => {
  it("缺少的工具带工具定义里的 Homebrew 命令和官网，错误参数里也带", async () => {
    const h = createToolchainHarness();
    const go = definitions.get("go");
    if (go === undefined) throw new Error("harness has no go definition");
    const withBrew = new Map(definitions);
    withBrew.set("go", {
      ...go,
      install: {
        darwin: { url: "https://go.dev/dl/", homebrew: { command: ["brew", "install", "go"] } },
      },
    });
    const service = new ToolchainService({
      platform: h.fake.platform,
      clock: h.fake.clock,
      definitions: withBrew,
      toolPaths: () => ({}),
      onChanged: () => undefined,
    });
    const result = await resolveWith(h, service.check({ requires: { go: { version: ">=1.24" } } }));
    expect(result.tools[0]).toMatchObject({
      tool: "go",
      status: "missing",
      installCommand: "brew install go",
      installUrl: "https://go.dev/dl/",
    });
    expect(result.errors[0]?.params).toMatchObject({
      installCommand: "brew install go",
      installUrl: "https://go.dev/dl/",
    });
  });

  it("模板自己写的安装方式优先于工具定义", async () => {
    const h = createToolchainHarness();
    const result = await resolveWith(
      h,
      h.service.check({
        requires: {
          go: { version: ">=1.24", install: { url: "https://example.org/own" } },
        },
      }),
    );
    expect(result.tools[0]).toMatchObject({ installUrl: "https://example.org/own" });
  });

  it("找到的工具不带安装方式", async () => {
    const h = createToolchainHarness();
    h.fake.tools.install("node", { version: "24.21.0" });
    const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));
    expect(result.tools[0]?.installCommand).toBeUndefined();
    expect(result.tools[0]?.installUrl).toBeUndefined();
  });
});

describe("芯片架构", () => {
  function machO(cpu: number): Uint8Array {
    const bytes = new Uint8Array(32);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0xfeedfacf, true);
    view.setUint32(4, cpu, true);
    return bytes;
  }

  it("从可执行文件开头读出 arm64，缓存里也留着，只读缓存时照样给", async () => {
    const h = createToolchainHarness();
    const path = h.fake.tools.install("node", { version: "24.21.0" });
    h.fake.fs.writeFile(absPath(path), machO(0x0100000c));
    const live = await resolveWith(h, h.service.check({ requires: nodeOnly() }));
    expect(live.tools[0]?.arch).toBe("arm64");
    const cached = await h.service.check({ requires: nodeOnly(), cachedOnly: true });
    expect(cached.tools[0]?.arch).toBe("arm64");
  });

  it("脚本读不出架构，不写这个字段", async () => {
    const h = createToolchainHarness();
    const path = h.fake.tools.install("node", { version: "24.21.0" });
    h.fake.fs.writeFile(absPath(path), "#!/bin/sh\n");
    const live = await resolveWith(h, h.service.check({ requires: nodeOnly() }));
    expect(live.tools[0]?.arch).toBeUndefined();
  });
});

describe("verifyPath", () => {
  it("手动指定的文件打得出版本号才算数；换成别的文件、不存在的文件都不算", async () => {
    const h = createToolchainHarness();
    const good = h.fake.tools.install("node", { version: "24.21.0", path: absPath("/opt/n/node") });
    expect(await resolveWith(h, h.service.verifyPath("node", good))).toBe(true);
    expect(await resolveWith(h, h.service.verifyPath("node", "/opt/none/node"))).toBe(false);
    expect(await resolveWith(h, h.service.verifyPath("ruby", good))).toBe(false);
  });
});
