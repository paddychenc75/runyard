import { describe, expect, it } from "vitest";
import { sampleSettings } from "./sample-data.ts";
import { settingsPatchSchema, settingsSchema } from "./settings.ts";

describe("Settings", () => {
  it("完整的设置通过，缺字段被拒绝", () => {
    expect(settingsSchema.safeParse(sampleSettings).success).toBe(true);
    const { libraryRoot: _root, ...missing } = sampleSettings;
    expect(settingsSchema.safeParse(missing).success).toBe(false);
  });

  it("空闲停止的分钟数必须是正整数，端口范围必须是合法端口", () => {
    expect(settingsSchema.safeParse({ ...sampleSettings, cliIdleStopMinutes: 0 }).success).toBe(
      false,
    );
    expect(
      settingsSchema.safeParse({ ...sampleSettings, ports: { min: 7100, max: 70000 } }).success,
    ).toBe(false);
  });

  it("[DESKTOP-SETTINGS-14] 镜像源和代理必须是带协议的地址，不合法的被拒绝", () => {
    const network = (patch: Record<string, unknown>) =>
      settingsPatchSchema.safeParse({ network: { noProxyLocal: true, ...patch } }).success;
    expect(network({ registry: "https://registry.npmmirror.com" })).toBe(true);
    expect(network({ proxy: "http://127.0.0.1:7890" })).toBe(true);
    expect(network({ proxy: "socks5://127.0.0.1:1080" })).toBe(true);
    expect(network({ proxy: "not a url" })).toBe(false);
    expect(network({ registry: "registry.npmmirror.com" })).toBe(false);
    expect(network({ registry: "ftp://mirror.example" })).toBe(false);
    expect(network({ proxy: "" })).toBe(false);
  });

  it("[RUN-OWNERSHIP-14] 补丁只带要改的字段，其余可以不传", () => {
    expect(settingsPatchSchema.safeParse({ cliIdleStopMinutes: 10 }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({}).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ cliIdleStopMinutes: -1 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ packageManager: "yarn" }).success).toBe(false);
  });
});
