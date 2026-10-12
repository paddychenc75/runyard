import { describe, expect, it } from "vitest";
import { createDarwinPlatform } from "../darwin/index.ts";
import { getPlatform } from "../get-platform.ts";
import { createLinuxPlatform } from "../linux/index.ts";
import { absPath } from "../path-types.ts";
import type { ContractContext } from "./context.ts";
import { runContract } from "./run-contract.ts";

const options = (home: string) => ({
  home: absPath(home),
  arch: "arm64" as const,
  profile: undefined,
});

// 契约测试需要平台实现，所以带 platform-dependent 标记（文件名后缀），Windows 任务不跑（docs/guides/testing.md）
// native：本机会选的那个实现（见 ContractContext.native）。getPlatform 是读系统的唯一地方，这里只比较它给出的 id
const hostId = getPlatform({ home: absPath(process.cwd()) }).id;

const implementations: ContractContext[] = [
  {
    name: "darwin",
    native: hostId === "darwin",
    create: (home) => createDarwinPlatform(options(home)),
    // macOS 没有标为不支持的成员；暂时还是占位，见 pending.contract.ts
    unsupported: new Set(),
  },
  {
    name: "linux",
    native: hostId === "linux",
    create: (home) => createLinuxPlatform(options(home)),
    // 薄实现：这三组标为系统不支持（技术设计 §7.1）
    unsupported: new Set([
      "fs.trash",
      "desktop.reveal",
      "desktop.openTerminalAt",
      "desktop.openInEditor",
      "cli.installShim",
    ]),
  },
];

for (const implementation of implementations) runContract(implementation);

describe("getPlatform：按当前系统选实现", () => {
  it("返回的实现的 id 与运行的系统一致", () => {
    expect(getPlatform({ home: absPath(process.cwd()) }).id).toBe(process.platform);
  });
});
