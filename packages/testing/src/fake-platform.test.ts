import { homedir } from "node:os";
import { absPath } from "@runyard/platform";
import { afterEach, describe, expect, it } from "vitest";
import { createFakePlatform, type FakePlatform } from "./fake-platform.ts";
import { createTempHome, type TempHome } from "./temp-home.ts";

describe("createFakePlatform", () => {
  it("拒绝真实的主目录", () => {
    expect(() => createFakePlatform({ home: absPath(homedir()) })).toThrow();
  });

  it("默认主目录不是真实目录；paths 沿用真实规则", () => {
    const { platform } = createFakePlatform();
    expect(platform.paths.home).toBe("/fake-home");
    expect(platform.paths.validateName("con")).toBe("reserved");
  });

  it("桌面接口只记录调用，不真的打开任何东西", async () => {
    const fake = createFakePlatform();
    await fake.platform.desktop.reveal(absPath("/a"));
    await fake.platform.desktop.openInEditor(absPath("/b"), "code");
    expect(fake.desktopCalls).toEqual([
      { kind: "reveal", path: "/a" },
      { kind: "openInEditor", dir: "/b", editor: "code" },
    ]);
  });
});

describe("假平台的 ipc", () => {
  let fake: FakePlatform | undefined;
  afterEach(async () => fake?.dispose());

  it("没有人监听时 connect 抛 SUPERVISOR_UNAVAILABLE；监听后能连上并收发", async () => {
    fake = createFakePlatform();
    await expect(fake.platform.ipc.connect(1000)).rejects.toMatchObject({
      error: { code: "SUPERVISOR_UNAVAILABLE" },
    });
    const server = await fake.platform.ipc.listen();
    const received = new Promise<string>((resolve) =>
      server.once("connection", (socket) => socket.once("data", (d) => resolve(d.toString()))),
    );
    const client = await fake.platform.ipc.connect(1000);
    client.write("ping");
    expect(await received).toBe("ping");
    expect(fake.platform.ipc.endpoint()).toContain("fake-ipc");
  });
});

describe("createTempHome", () => {
  let temp: TempHome | undefined;
  afterEach(() => temp?.dispose());

  it("在系统临时目录下建主目录，带 .runyard 和 Runyard，用后删除", async () => {
    const { existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { realpathSync } = await import("node:fs");
    temp = createTempHome();
    expect(temp.home.startsWith(realpathSync(tmpdir()))).toBe(true);
    expect(temp.home).toContain("runyard-test-");
    expect(existsSync(temp.stateDir)).toBe(true);
    expect(existsSync(temp.library)).toBe(true);
    expect(createFakePlatform({ home: temp.home }).platform.paths.home).toBe(temp.home);
    temp.dispose();
    expect(existsSync(temp.home)).toBe(false);
    temp.dispose(); // 可以重复调用
  });
});
