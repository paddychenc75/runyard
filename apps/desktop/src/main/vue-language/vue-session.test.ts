import { describe, expect, it, vi } from "vitest";
import type { LanguageProcess } from "../integration/vue-process.ts";
import { LanguageFrames, languageFrame } from "./language-frames.ts";
import { createVueSession } from "./vue-session.ts";

function fakeProcess(target: "vue" | "ts") {
  let data: (chunk: Buffer) => void = () => {};
  let exited: () => void = () => {};
  const messages: Record<string, unknown>[] = [];
  const emit = (message: unknown) => data(Buffer.from(languageFrame(message)));
  const link: LanguageProcess = {
    ref: { pid: target === "vue" ? 10 : 11, startTime: 1 },
    write(text) {
      const message =
        target === "vue" ? new LanguageFrames().push(Buffer.from(text))[0] : JSON.parse(text);
      messages.push(message);
      if (target === "vue" && message.method === "initialize") emit({ id: message.id, result: {} });
      if (target === "ts")
        emit({
          type: "response",
          request_seq: message.seq,
          success: true,
          body: { title: "value" },
        });
    },
    onData: (listener) => {
      data = listener;
    },
    onExit: (listener) => {
      exited = listener;
    },
    stop: vi.fn(async () => {
      exited();
    }),
  };
  return { link, messages, emit, crash: () => exited() };
}
describe("Vue 双协议会话", () => {
  it("转发嵌套 tsserver/request 并只返回 body，文档同步交给两端", async () => {
    const vue = fakeProcess("vue");
    const ts = fakeProcess("ts");
    const session = await createVueSession({
      folder: "/project",
      launch: async (target) => (target === "vue" ? vue.link : ts.link),
      failed: () => {},
    });
    try {
      vue.emit({ method: "tsserver/request", params: [[42, "vue:getComponentProps", ["x.vue"]]] });
      await vi.waitFor(() =>
        expect(vue.messages).toContainEqual({
          jsonrpc: "2.0",
          method: "tsserver/response",
          params: [[42, { title: "value" }]],
        }),
      );
      expect(ts.messages).toContainEqual(
        expect.objectContaining({ command: "vue:getComponentProps", arguments: ["x.vue"] }),
      );
      await session.sync({ file: "/project/Use.vue", text: "old", version: 1 });
      await session.sync({ file: "/project/Use.vue", text: "new", version: 2 });
      expect(ts.messages.filter((message) => message.command === "updateOpen")).toHaveLength(2);
      expect(vue.messages).toContainEqual(
        expect.objectContaining({
          method: "textDocument/didChange",
          params: expect.objectContaining({ contentChanges: [{ text: "new" }] }),
        }),
      );
    } finally {
      await session.stop();
    }
  });
  it("[DESKTOP-EDITOR-92] 进程崩溃立即拒绝等待请求，只通知一次，停止收拾两个进程", async () => {
    const vue = fakeProcess("vue");
    const ts = fakeProcess("ts");
    const failed = vi.fn();
    const session = await createVueSession({
      folder: "/project",
      launch: async (target) => (target === "vue" ? vue.link : ts.link),
      failed,
    });
    const request = session.request("vue", "textDocument/completion", {});
    const rejected = expect(request).rejects.toThrow("LANGUAGE_PROCESS_EXITED");
    vue.crash();
    ts.crash();
    await rejected;
    expect(failed).toHaveBeenCalledOnce();
    await session.stop();
    expect(vue.link.stop).toHaveBeenCalledOnce();
    expect(ts.link.stop).toHaveBeenCalledOnce();
  });
  it("取消请求发送窄的取消通知，晚到响应不会恢复等待", async () => {
    const vue = fakeProcess("vue");
    const ts = fakeProcess("ts");
    const session = await createVueSession({
      folder: "/project",
      launch: async (target) => (target === "vue" ? vue.link : ts.link),
      failed: () => {},
    });
    try {
      const abort = new AbortController();
      const pending = session.request("vue", "textDocument/completion", {}, abort.signal);
      const rejection = expect(pending).rejects.toThrow("LANGUAGE_CANCELLED");
      abort.abort();
      await rejection;
      const request = vue.messages.find((message) => message.method === "textDocument/completion");
      expect(vue.messages).toContainEqual({
        jsonrpc: "2.0",
        method: "$/cancelRequest",
        params: { id: request?.id },
      });
      vue.emit({ id: request?.id, result: { items: [] } });
    } finally {
      await session.stop();
    }
  });
});
