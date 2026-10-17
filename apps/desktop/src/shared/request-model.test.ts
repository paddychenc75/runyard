import { describe, expect, it } from "vitest";
import {
  buildCurl,
  draftToSpec,
  formatBody,
  headersToText,
  normalizePath,
  notReadyReason,
  parseHeaders,
  reloadedAgain,
  specToDraft,
  statusTone,
} from "./request-model.ts";

describe("请求面板的纯逻辑", () => {
  it("请求头：每行 名字: 值，空行和没有冒号的行忽略，同名的都保留，值里的冒号不动", () => {
    expect(
      parseHeaders(
        "content-type: application/json\n\nbogus\n x-a :1\nx-a: 2\r\nreferer: http://h:80/",
      ),
    ).toEqual([
      { name: "content-type", value: "application/json" },
      { name: "x-a", value: "1" },
      { name: "x-a", value: "2" },
      { name: "referer", value: "http://h:80/" },
    ]);
    expect(headersToText(parseHeaders("a: 1\nb: 2"))).toBe("a: 1\nb: 2");
  });

  it("路径总以 / 开头：没写补上，空的是 /，不替用户拆主机", () => {
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("  ")).toBe("/");
    expect(normalizePath("todos?a=1")).toBe("/todos?a=1");
    expect(normalizePath("//example.com/x")).toBe("//example.com/x");
  });

  it("[DESKTOP-REQUEST-PANEL-04] GET 不带请求体；其他方法带上；草稿和请求可以互转", () => {
    const base = { path: "/t", headers: "a: 1", payload: '{"x":1}' };
    expect(draftToSpec({ method: "GET", ...base }).payload).toBe("");
    expect(draftToSpec({ method: "POST", ...base })).toEqual({
      method: "POST",
      path: "/t",
      headers: [{ name: "a", value: "1" }],
      payload: '{"x":1}',
    });
    const spec = draftToSpec({ method: "PUT", ...base });
    expect(draftToSpec(specToDraft(spec))).toEqual(spec);
  });

  it("[DESKTOP-REQUEST-PANEL-03] JSON 响应体按两格缩进整理，其他原样", () => {
    expect(formatBody('[{"id":1}]')).toEqual({ text: '[\n  {\n    "id": 1\n  }\n]', json: true });
    expect(formatBody("hello")).toEqual({ text: "hello", json: false });
    expect(formatBody("{broken")).toEqual({ text: "{broken", json: false });
  });

  it("状态码的颜色档", () => {
    expect([200, 204, 301, 404, 500].map(statusTone)).toEqual([
      "success",
      "success",
      "neutral",
      "warning",
      "danger",
    ]);
  });

  it("[DESKTOP-REQUEST-PANEL-06] 只有就绪才能发送；启动中和已停止的说明不同", () => {
    expect(notReadyReason({ state: "ready" })).toBeNull();
    for (const state of ["checking", "installing", "starting", "reloading"] as const) {
      expect(notReadyReason({ state })).toBe("starting");
    }
    for (const state of ["idle", "stopped", "crashed", "failed", "errored"] as const) {
      expect(notReadyReason({ state })).toBe("stopped");
    }
  });

  it("[DESKTOP-REQUEST-PANEL-09] 只有从重载回到就绪算“重载后”，首次启动和重启不算", () => {
    expect(reloadedAgain("reloading", "ready")).toBe(true);
    expect(reloadedAgain("starting", "ready")).toBe(false);
    expect(reloadedAgain("ready", "ready")).toBe(false);
    expect(reloadedAgain("reloading", "crashed")).toBe(false);
  });
});

describe("复制为 curl 的写法", () => {
  it("GET 不写 -X 也不带请求体；DELETE 写 -X DELETE", () => {
    expect(buildCurl({ method: "GET", path: "/todos", headers: [], payload: "" }, 7102)).toBe(
      "curl --globoff 'http://127.0.0.1:7102/todos'",
    );
    expect(buildCurl({ method: "DELETE", path: "/todos/1", headers: [], payload: "" }, 7102)).toBe(
      "curl --globoff -X DELETE 'http://127.0.0.1:7102/todos/1'",
    );
  });
});
