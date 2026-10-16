import { describe, expect, it } from "vitest";
import { defaultParams, formatParams, parseParams } from "./params.ts";

describe("工作台地址栏参数", () => {
  it("没有参数就是默认值", () => {
    expect(parseParams("")).toEqual(defaultParams);
  });

  it("认识主题、语言、组件，不认识的值回退默认", () => {
    expect(parseParams("?component=Button&theme=dark&locale=zh-CN")).toEqual({
      component: "Button",
      theme: "dark",
      locale: "zh-CN",
      platform: "darwin",
    });
    expect(parseParams("?theme=neon&locale=fr&platform=win32&component=")).toEqual(defaultParams);
  });

  it("写回地址栏时只写和默认值不同的，解析回来一致", () => {
    expect(formatParams(defaultParams)).toBe("");
    const params = {
      ...defaultParams,
      component: "Icon",
      theme: "light",
      locale: "zh-CN",
    } as const;
    expect(formatParams(params)).toBe("?component=Icon&theme=light&locale=zh-CN");
    expect(parseParams(formatParams(params))).toEqual(params);
  });
});
