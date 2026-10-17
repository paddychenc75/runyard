import { describe, expect, it } from "vitest";
import {
  desktopChannels,
  desktopEventNames,
  desktopMethodNames,
} from "../../shared/desktop-bridge.ts";
import { editorFileMethodNames } from "../../shared/editor-files.ts";
import { type IpcHost, type IpcSender, registerBridgeHandlers } from "../ipc-handlers.ts";
import type { LibraryController } from "../library-controller.ts";
import { editorFileMethods } from "./editor-ipc.ts";
import type { EditorFileService } from "./file-service.ts";

type Call = [string, ...unknown[]];

function fakeService(calls: Call[]): EditorFileService {
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      calls.push([name, ...args]);
      return { ok: true, value: name };
    };
  return {
    list: record("list"),
    read: record("read"),
    write: record("write"),
    create: record("create"),
    rename: record("rename"),
    trash: record("trash"),
    watch: record("watch"),
    unwatch: record("unwatch"),
    absolutePath: async (project: string, path: string) =>
      path === "gone" ? null : `/lib/${project}/${path}`,
  } as unknown as EditorFileService;
}

describe("文件方法的消息接线", () => {
  it("每个方法把界面发来的参数交给服务；服务只收到项目 id 和相对路径", async () => {
    const calls: Call[] = [];
    const methods = editorFileMethods(fakeService(calls));
    const at = { project: "demo", path: "src/a.ts" };
    await methods["files.list"](at);
    await methods["files.read"](at);
    await methods["files.write"]({ ...at, content: "x", eol: "crlf" });
    await methods["files.write"]({ ...at, content: "x", eol: "weird" });
    await methods["files.create"]({ project: "demo", path: "src", kind: "folder", name: "lib" });
    await methods["files.rename"]({ ...at, name: "b.ts" });
    await methods["files.trash"]({ ...at, unsaved: "u" });
    await methods["files.trash"]({ ...at });
    await methods["files.watch"]({ project: "demo" });
    await methods["files.unwatch"]({ project: "demo" });
    expect(calls).toEqual([
      ["list", "demo", "src/a.ts"],
      ["read", "demo", "src/a.ts"],
      ["write", "demo", "src/a.ts", "x", "crlf"],
      ["write", "demo", "src/a.ts", "x", undefined],
      ["create", "demo", "src", "folder", "lib"],
      ["rename", "demo", "src/a.ts", "b.ts"],
      ["trash", "demo", "src/a.ts", "u"],
      ["trash", "demo", "src/a.ts", undefined],
      ["watch", "demo"],
      ["unwatch", "demo"],
    ]);
  });

  it("页面发来形状不对的数据时不调用服务，返回失败结果而不是抛异常", async () => {
    const calls: Call[] = [];
    const methods = editorFileMethods(fakeService(calls));
    const bad: unknown[] = [undefined, null, "x", 3, {}, { project: 1, path: "a" }];
    for (const name of editorFileMethodNames) {
      for (const param of bad) {
        const result = await methods[name](param);
        // 这三个动作没有返回值（取消监听、在访达中显示、用系统程序打开）
        if (!["files.unwatch", "files.reveal", "files.openExternal"].includes(name)) {
          expect(result).toMatchObject({ ok: false, error: { code: "EDITOR_IO_FAILED" } });
        }
      }
    }
    await methods["files.write"]({ project: "d", path: "a", content: 5 });
    await methods["files.create"]({ project: "d", path: "", name: "x", kind: "symlink" });
    await methods["files.rename"]({ project: "d", path: "a", name: 5 });
    expect(calls).toEqual([]);
  });

  it("在访达中显示、用系统程序打开：只把限定在项目内的绝对路径交给 Electron 那一侧；找不到或形状不对时什么都不做", async () => {
    const reveal: string[] = [];
    const open: string[] = [];
    const methods = editorFileMethods(fakeService([]), {
      reveal: (path) => void reveal.push(path),
      open: (path) => void open.push(path),
    });
    await methods["files.reveal"]({ project: "demo", path: "public/logo.png" });
    await methods["files.openExternal"]({ project: "demo", path: "dump.json" });
    await methods["files.reveal"]({ project: "demo", path: "gone" });
    await methods["files.openExternal"]({ path: "dump.json" });
    expect(reveal).toEqual(["/lib/demo/public/logo.png"]);
    expect(open).toEqual(["/lib/demo/dump.json"]);
  });
});

describe("桥的白名单", () => {
  it("文件方法和 files.changed 事件在白名单里，每个方法都有处理函数", () => {
    for (const name of editorFileMethodNames) expect(desktopMethodNames).toContain(name);
    expect(desktopEventNames).toContain("files.changed");
  });

  it("经桥调用文件方法：只响应来自应用自己页面的发送者，没接线文件服务时调用失败", async () => {
    const handlers = new Map<string, (sender: IpcSender, ...args: unknown[]) => unknown>();
    const host: IpcHost = {
      handle: (channel, handler) => void handlers.set(channel, handler),
      handleSync: () => {},
      send: () => {},
    };
    const controller = {
      getState: () => ({}),
      onChange: () => () => {},
      onConsole: () => () => {},
    } as unknown as LibraryController;
    const calls: Call[] = [];
    registerBridgeHandlers(host, controller, {} as never, fakeService(calls));
    const call = handlers.get(desktopChannels.call);
    const app = { url: "app://runyard/index.html" };
    await call?.(app, "files.read", { project: "demo", path: "a" });
    expect(calls).toEqual([["read", "demo", "a"]]);
    expect(() =>
      call?.({ url: "http://127.0.0.1:3000/" }, "files.read", { project: "demo", path: "a" }),
    ).toThrow("untrusted sender");

    const bare = new Map<string, (sender: IpcSender, ...args: unknown[]) => unknown>();
    registerBridgeHandlers(
      { ...host, handle: (channel, handler) => void bare.set(channel, handler) },
      controller,
      {} as never,
    );
    expect(() =>
      bare.get(desktopChannels.call)?.(app, "files.read", { project: "d", path: "a" }),
    ).toThrow("file service unavailable");
  });
});
