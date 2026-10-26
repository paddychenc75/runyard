import { expect, it, vi } from "vitest";
import type { VueChannel } from "./vue-channel.ts";
import { vueMethods } from "./vue-ipc.ts";

const base = { project: "p", path: "src/App.vue", requestId: "r", kind: "formatting" };

function channel() {
  const request = vi.fn(async () => ({ ok: true as const, value: [] }));
  return { request, methods: vueMethods({ request } as unknown as VueChannel) };
}

it("[DESKTOP-EDITOR-98] 格式化请求的缩进设置必须是合法的数字和布尔值，其余一律拒绝", async () => {
  const { request, methods } = channel();
  const call = methods["vue.request"];
  expect(await call({ ...base, format: { tabSize: 2, insertSpaces: true } })).toEqual({
    ok: true,
    value: [],
  });
  expect(request).toHaveBeenCalledWith({
    ...base,
    format: { tabSize: 2, insertSpaces: true },
  });
  for (const format of [
    undefined,
    { tabSize: 0, insertSpaces: true },
    { tabSize: 17, insertSpaces: true },
    { tabSize: 2.5, insertSpaces: true },
    { tabSize: 2, insertSpaces: "yes" },
    { tabSize: 2, insertSpaces: true, command: "rm" },
  ]) {
    request.mockClear();
    const result = await call({ ...base, format });
    if (format && "command" in format) {
      // 多余的字段被丢掉，不会原样转给语言服务器
      expect(request).toHaveBeenCalledWith({
        ...base,
        format: { tabSize: 2, insertSpaces: true },
      });
    } else {
      expect(result).toEqual({ ok: false, reason: "invalid" });
      expect(request).not.toHaveBeenCalled();
    }
  }
});
