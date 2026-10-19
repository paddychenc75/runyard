import { describe, expect, it, vi } from "vitest";
import { languageProcessArgs } from "../integration/vue-process.ts";
import { LanguageFrames } from "./language-frames.ts";
import { VueProjects } from "./vue-projects.ts";

describe("Vue 语言进程", () => {
  it("[DESKTOP-EDITOR-90] 只授权项目与随包目录读取，先加载守卫", () => {
    const args = languageProcessArgs("vue", "/project", "/service");
    expect(args).toContain("--permission");
    expect(args.filter((arg) => arg.startsWith("--allow-"))).toEqual([
      "--allow-fs-read=/project",
      "--allow-fs-read=/service",
    ]);
    expect(args.indexOf("--require")).toBeLessThan(args.indexOf("--stdio"));
  });
  it("分帧按字节处理中文、分段头与多个响应", () => {
    const frames = new LanguageFrames();
    const body = JSON.stringify({ result: "中文" });
    const wire = Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}\r\n`);
    expect(frames.push(wire.subarray(0, 10))).toEqual([]);
    expect(frames.push(Buffer.concat([wire.subarray(10), wire]))).toEqual([
      { result: "中文" },
      { result: "中文" },
    ]);
  });
  it("[DESKTOP-EDITOR-91] 最多两个项目，淘汰最久未用并等待结束；关闭与退出不留会话", async () => {
    const sessions: ReturnType<typeof fakeSession>[] = [];
    const manager = new VueProjects(async (_folder, failed) => {
      const session = fakeSession(failed);
      sessions.push(session);
      return session;
    });
    await manager.open("a", "/a");
    await manager.open("b", "/b");
    await manager.open("a", "/a");
    await manager.open("c", "/c");
    expect(sessions[1]?.stop).toHaveBeenCalledOnce();
    expect(sessions[0]?.stop).not.toHaveBeenCalled();
    await manager.close("a");
    await manager.dispose();
    expect(sessions.every((session) => session.stop.mock.calls.length === 1)).toBe(true);
  });
  it("[DESKTOP-EDITOR-92] 连续三次崩溃停止重启，关闭重开才重置", async () => {
    const sessions: ReturnType<typeof fakeSession>[] = [];
    const manager = new VueProjects(async (_folder, failed) => {
      const session = fakeSession(failed);
      sessions.push(session);
      return session;
    });
    await manager.open("a", "/a");
    for (let i = 0; i < 3; i++) {
      sessions[i]?.failed();
      await manager.idle();
    }
    expect(sessions).toHaveLength(3);
    await expect(manager.open("a", "/a")).rejects.toThrow();
    await manager.close("a");
    await manager.open("a", "/a");
    expect(sessions).toHaveLength(4);
    await manager.dispose();
  });
  it("[DESKTOP-EDITOR-92] 恢复重放未保存文档，已关闭文档不复活", async () => {
    const sessions: ReturnType<typeof fakeSession>[] = [];
    const manager = new VueProjects(async (_folder, failed) => {
      const session = fakeSession(failed);
      sessions.push(session);
      return session;
    });
    const document = { file: "/a/Use.vue", text: "unsaved", version: 2 };
    await manager.sync("a", "/a", document);
    sessions[0]?.failed();
    await manager.idle();
    expect(sessions[1]?.sync).toHaveBeenCalledWith(document);
    await manager.closeDocument("a", document.file);
    sessions[1]?.failed();
    await manager.idle();
    expect(sessions[2]?.sync).not.toHaveBeenCalled();
    await manager.dispose();
  });
  it("[DESKTOP-EDITOR-92] 初始化拒绝只尝试三次，并报告禁用", async () => {
    const launch = vi.fn(async () => {
      throw new Error("start failed");
    });
    const status = vi.fn();
    const manager = new VueProjects(launch, status);
    await expect(manager.open("a", "/a")).rejects.toThrow("LANGUAGE_DISABLED");
    expect(launch).toHaveBeenCalledTimes(3);
    expect(status).toHaveBeenLastCalledWith("a", "disabled");
    await manager.dispose();
  });
  it("[DESKTOP-EDITOR-91] 正在同步的文档提交先完成，关闭和重开不会越过它", async () => {
    let finish = () => {};
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const session = fakeSession(() => {});
    session.sync.mockImplementationOnce(() => pending);
    const manager = new VueProjects(async () => session);
    const sync = manager.sync("a", "/a", { file: "/a/Use.vue", text: "unsaved", version: 1 });
    await vi.waitFor(() => expect(session.sync).toHaveBeenCalledOnce());
    const close = manager.close("a");
    expect(session.stop).not.toHaveBeenCalled();
    finish();
    await sync;
    await close;
    expect(session.stop).toHaveBeenCalledOnce();
    await manager.dispose();
  });
});
function fakeSession(failed: () => void) {
  return {
    failed,
    stop: vi.fn(async () => {}),
    request: vi.fn(async () => null),
    sync: vi.fn(async () => {}),
    closeDocument: vi.fn(async () => {}),
    changed: vi.fn(),
    reloadProjects: vi.fn(),
  };
}
