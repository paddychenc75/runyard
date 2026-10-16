import { absPath, joinPath, posixRelPath } from "@runyard/platform";
import type { ToolDefinition } from "@runyard/protocol";
import { createFakePlatform } from "@runyard/testing";
import { describe, expect, it, vi } from "vitest";
import { detectInstallContext, selectInstallHint } from "./install-hint.ts";

const nodeDefinition: ToolDefinition = {
  formatVersion: 1,
  id: "node",
  supported: ">=22 <27",
  detect: { args: ["--version"], pattern: "v(\\d+\\.\\d+\\.\\d+)" },
  install: {
    darwin: {
      url: "https://nodejs.org/en/download",
      versionManagers: [{ id: "nvm", command: ["nvm", "install", "--lts"] }],
      homebrew: { command: ["brew", "install", "node"] },
    },
  },
};

async function hintIn(setup: (fake: ReturnType<typeof createFakePlatform>) => void) {
  const fake = createFakePlatform();
  setup(fake);
  const context = await detectInstallContext(fake.platform, { PATH: "/usr/bin" }, [nodeDefinition]);
  return { fake, hint: selectInstallHint({ tool: "node", definition: nodeDefinition, context }) };
}

describe("安装提示的选择", () => {
  it("[TEMPLATES-FORMAT-35] 有 nvm：nvm 的命令加官网链接", async () => {
    const { hint } = await hintIn((fake) => {
      fake.fs.mkdir(joinPath(fake.platform.paths.home, posixRelPath(".nvm")));
      fake.tools.install("brew", { version: "4.0.0" }); // 两样都有时 nvm 优先
    });
    expect(hint.commands).toEqual([
      { source: "version-manager", manager: "nvm", command: ["nvm", "install", "--lts"] },
    ]);
    expect(hint.urls).toEqual(["https://nodejs.org/en/download"]);
  });

  it("[TEMPLATES-FORMAT-35] 只有 Homebrew：brew 的命令加官网链接", async () => {
    const { hint } = await hintIn((fake) => fake.tools.install("brew", { version: "4.0.0" }));
    expect(hint.commands).toEqual([{ source: "homebrew", command: ["brew", "install", "node"] }]);
    expect(hint.urls).toEqual(["https://nodejs.org/en/download"]);
  });

  it("[TEMPLATES-FORMAT-35] 都没有：只有官网链接", async () => {
    const { hint } = await hintIn(() => undefined);
    expect(hint.commands).toEqual([]);
    expect(hint.urls).toEqual(["https://nodejs.org/en/download"]);
  });

  it("NVM_DIR 指向别处时按它找", async () => {
    const fake = createFakePlatform();
    fake.fs.mkdir(absPath("/opt/nvm"));
    const context = await detectInstallContext(
      fake.platform,
      { PATH: "/usr/bin", NVM_DIR: "/opt/nvm" },
      [nodeDefinition],
    );
    expect(context.versionManagers.has("nvm")).toBe(true);
  });

  it("[TEMPLATES-FORMAT-36] 用户模板自己写的安装方式出现在提示里，但检测和选择都不执行任何东西", async () => {
    const fake = createFakePlatform();
    const spawn = vi.spyOn(fake.platform.exec, "spawn");
    const spawnDetached = vi.spyOn(fake.platform.exec, "spawnDetached");
    const context = await detectInstallContext(fake.platform, { PATH: "/usr/bin" }, [
      nodeDefinition,
    ]);
    const hint = selectInstallHint({
      tool: "mytool",
      requirement: {
        version: ">=1",
        install: {
          command: ["curl", "-fsSL", "https://example.com/install.sh"],
          url: "https://example.com/mytool",
        },
      },
      context,
    });
    expect(hint.commands).toEqual([
      { source: "template", command: ["curl", "-fsSL", "https://example.com/install.sh"] },
    ]);
    expect(hint.urls).toEqual(["https://example.com/mytool"]);
    expect(spawn).not.toHaveBeenCalled();
    expect(spawnDetached).not.toHaveBeenCalled();
    expect(fake.processes.spawned).toEqual([]);
  });

  it("模板的命令排在前面，工具定义的官网链接仍然给出", () => {
    const hint = selectInstallHint({
      tool: "node",
      definition: nodeDefinition,
      requirement: { version: ">=22", install: { command: ["my", "installer"] } },
      context: { versionManagers: new Set(), homebrew: true },
    });
    expect(hint.commands.map((c) => c.source)).toEqual(["template", "homebrew"]);
    expect(hint.urls).toEqual(["https://nodejs.org/en/download"]);
  });
});
