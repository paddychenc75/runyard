import { describe, expect, it } from "vitest";
import { createDarwinPlatform } from "../../darwin/index.ts";
import { createLinuxPlatform } from "../../linux/index.ts";
import { absPath } from "../../path-types.ts";
import { isPlatformError } from "../../platform-error.ts";
import { checkedSocketPath, ipcLocations } from "./endpoint.ts";

const options = (home: string, profile: "dev" | undefined = undefined) => ({
  home: absPath(home),
  arch: "arm64" as const,
  profile,
});

describe("连接点位置", () => {
  it("socket 和锁文件都在状态目录的 run/ 下", () => {
    const locations = ipcLocations(absPath("/home/u/.runyard"));
    expect(locations.socket).toBe("/home/u/.runyard/run/supervisor.sock");
    expect(locations.lockFile).toBe("/home/u/.runyard/run/supervisor.lock");
  });

  it("[SUPERVISOR-LIFECYCLE-06] 开发版和正式版的连接点不同", () => {
    for (const create of [createDarwinPlatform, createLinuxPlatform]) {
      const prod = create(options("/home/u")).ipc.endpoint();
      const dev = create(options("/home/u", "dev")).ipc.endpoint();
      expect(prod).toBe("/home/u/.runyard/run/supervisor.sock");
      expect(dev).toBe("/home/u/.runyard-dev/run/supervisor.sock");
    }
  });
});

describe("socket 路径长度上限", () => {
  // 主目录长度让整条路径刚好等于或多出一个字节
  const base = "/h/.runyard/run/supervisor.sock".length;
  const homeFor = (total: number) => `/${"a".repeat(total - base + 1)}`;

  it("macOS：104 字节可以，105 字节报 PATH_TOO_LONG", () => {
    expect(createDarwinPlatform(options(homeFor(104))).ipc.endpoint()).toHaveLength(104);
    expect(() => createDarwinPlatform(options(homeFor(105))).ipc.endpoint()).toThrow(
      /PATH_TOO_LONG/,
    );
  });

  it("Linux：108 字节可以，109 字节报 PATH_TOO_LONG", () => {
    expect(createLinuxPlatform(options(homeFor(108))).ipc.endpoint()).toHaveLength(108);
    expect(() => createLinuxPlatform(options(homeFor(109))).ipc.endpoint()).toThrow(
      /PATH_TOO_LONG/,
    );
  });

  it("错误带代码和参数，不是句子；字节数按字节算，不按字符", () => {
    const locations = ipcLocations(absPath(`/${"数".repeat(40)}/.runyard`));
    try {
      checkedSocketPath(locations, 104);
      expect.unreachable();
    } catch (error) {
      expect(isPlatformError(error)).toBe(true);
      if (isPlatformError(error)) expect(error.error.code).toBe("PATH_TOO_LONG");
    }
  });

  it("listen 和 connect 也先检查长度（connect 变成被拒绝的 Promise）", async () => {
    const platform = createDarwinPlatform(options(homeFor(120)));
    await expect(platform.ipc.listen()).rejects.toThrow(/PATH_TOO_LONG/);
    await expect(platform.ipc.connect(100)).rejects.toThrow(/PATH_TOO_LONG/);
  });
});
