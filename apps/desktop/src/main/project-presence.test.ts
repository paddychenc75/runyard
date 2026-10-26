import { describe, expect, it, vi } from "vitest";
import { ProjectPresence } from "./project-presence.ts";

describe("项目目录存在性检查", () => {
  it("[DESKTOP-LIBRARY-VIEW-49] 无变化只检查已知根目录，不重扫目录树", async () => {
    const exists = vi.fn(async () => true);
    const rescan = vi.fn(async () => {});
    const presence = new ProjectPresence(
      () => [
        { id: "a", path: "/root/a" },
        { id: "b", path: "/root/b" },
      ],
      exists,
      rescan,
    );
    await presence.check();
    await presence.check();
    expect(exists.mock.calls).toEqual([["/root/a"], ["/root/b"], ["/root/a"], ["/root/b"]]);
    expect(rescan).not.toHaveBeenCalled();
  });
  it("[DESKTOP-LIBRARY-VIEW-49] 消失和恢复各重扫一次，已知缺失不反复扫描", async () => {
    let exists = false;
    let row: { id: string; path: string; missingSince?: number } = { id: "a", path: "/root/a" };
    const rescan = vi.fn(async () => {
      row = exists ? { id: "a", path: "/root/a" } : { ...row, missingSince: 1 };
    });
    const presence = new ProjectPresence(
      () => [row],
      async () => exists,
      rescan,
    );
    await presence.check();
    await presence.check();
    expect(rescan).toHaveBeenCalledTimes(1);
    exists = true;
    await presence.check();
    await presence.check();
    expect(rescan).toHaveBeenCalledTimes(2);
  });
  it("打开或文件变更只检查指定项目", async () => {
    const exists = vi.fn(async () => true);
    const presence = new ProjectPresence(
      () => [
        { id: "a", path: "/root/a" },
        { id: "b", path: "/root/b" },
      ],
      exists,
      async () => {},
    );
    await presence.check("b");
    expect(exists.mock.calls).toEqual([["/root/b"]]);
  });
  it("等待检查时已重新定位，丢弃旧路径结果", async () => {
    let finish: (exists: boolean) => void = () => {};
    let path = "/old";
    const rescan = vi.fn(async () => {});
    const presence = new ProjectPresence(
      () => [{ id: "a", path }],
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      rescan,
    );
    const checking = presence.check("a");
    path = "/new";
    finish(false);
    await checking;
    expect(rescan).not.toHaveBeenCalled();
  });
  it("读取错误不伪装成文件夹缺失，不启动重扫", async () => {
    const rescan = vi.fn(async () => {});
    const presence = new ProjectPresence(
      () => [{ id: "a", path: "/root/a" }],
      async () => {
        throw new Error("denied");
      },
      rescan,
    );
    await expect(presence.check()).rejects.toThrow("denied");
    expect(rescan).not.toHaveBeenCalled();
  });
});
