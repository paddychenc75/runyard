import { describe, expect, it, vi } from "vitest";
import { vueMethods } from "./vue-ipc.ts";

describe("Vue 通道输入白名单", () => {
  it("只接受规定的请求类型、有限非负位置和版本，未知原始协议不调用服务", async () => {
    const request = vi.fn();
    const sync = vi.fn();
    const methods = vueMethods({ request, sync } as never);
    await methods["vue.request"]({
      project: "p",
      path: "Use.vue",
      requestId: "1",
      kind: "workspace/executeCommand",
    });
    await methods["vue.request"]({
      project: "p",
      path: "Use.vue",
      requestId: "1",
      kind: "hover",
      position: { line: -1, character: 0 },
    });
    await methods["vue.sync"]({ project: "p", path: "Use.vue", text: "x", version: NaN });
    expect(request).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });
});
