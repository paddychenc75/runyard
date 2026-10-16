import { dirname } from "node:path";
import { absPath, supervisorLogPath } from "@runyard/platform";
import { createFakePlatform } from "@runyard/testing";
import { describe, expect, it } from "vitest";
import { rotateSupervisorLog } from "./supervisor-log-rotation.ts";

describe("supervisor.log 轮转", () => {
  const setup = async (content: string | undefined) => {
    const { platform } = createFakePlatform();
    const log = supervisorLogPath(platform.paths.stateDir);
    await platform.fs.makeDir(absPath(dirname(log)));
    if (content !== undefined) await platform.fs.writeFile(log, content);
    return { platform, log };
  };

  it("没超过大小不动", async () => {
    const { platform, log } = await setup("short");
    expect(await rotateSupervisorLog(platform, { maxBytes: 100 })).toBe(false);
    expect(await platform.fs.readText(log)).toBe("short");
  });

  it("文件不存在不报错", async () => {
    const { platform } = await setup(undefined);
    expect(await rotateSupervisorLog(platform, { maxBytes: 1 })).toBe(false);
  });

  it("超过大小：内容复制到 .1，原文件清空，旧的 .1 顺延到 .2，最老的一份被盖掉", async () => {
    const { platform, log } = await setup("third-long-content");
    await platform.fs.writeFile(absPath(`${log}.1`), "second");
    await platform.fs.writeFile(absPath(`${log}.2`), "first");
    expect(await rotateSupervisorLog(platform, { maxBytes: 5, kept: 3 })).toBe(true);
    expect(await platform.fs.readText(log)).toBe("");
    expect(await platform.fs.readText(absPath(`${log}.1`))).toBe("third-long-content");
    expect(await platform.fs.readText(absPath(`${log}.2`))).toBe("second");
    expect(await platform.fs.readText(absPath(`${log}.3`))).toBe("first");
    // 再来一轮：.3 保留的是最老的一份，超出 kept 的不再增加
    await platform.fs.writeFile(log, "fourth-long-content");
    await rotateSupervisorLog(platform, { maxBytes: 5, kept: 3 });
    expect(await platform.fs.readText(absPath(`${log}.3`))).toBe("second");
    expect(await platform.fs.exists(absPath(`${log}.4`))).toBe(false);
  });
});
