import { createFakePlatform } from "@runyard/testing";
import { describe, expect, it } from "vitest";
import { chooseRunPort } from "./choose-run-port.ts";
import { DEFAULT_PORT_RANGE } from "./port-range.ts";

function setup() {
  const fake = createFakePlatform();
  const choose = (wanted: number, registered: number[] = []) =>
    chooseRunPort({
      platform: fake.platform,
      wanted,
      range: DEFAULT_PORT_RANGE,
      registeredByOthers: new Set(registered),
    });
  return { fake, choose };
}

describe("一次运行用哪个端口", () => {
  it("[RUN-PORTS-05] 登记的端口空闲就用它，没有 portFallback", async () => {
    const { choose } = setup();
    expect(await choose(7104)).toEqual({ port: 7104 });
  });

  it("[RUN-PORTS-06] 原端口被占用：本次换成更大的空闲端口，说明原端口和占用者", async () => {
    const { fake, choose } = setup();
    fake.ports.occupy(7104, { pid: 4242, name: "python3" });
    const chosen = await choose(7104);
    expect(chosen).toEqual({
      port: 7105,
      portFallback: {
        wanted: 7104,
        reason: "PORT_OCCUPIED",
        occupant: { pid: 4242, name: "python3" },
      },
    });
  });

  it("[RUN-PORTS-06] 绑定在 0.0.0.0 上的占用者（平台层判为 in-use）同样触发回退", async () => {
    const { fake, choose } = setup();
    fake.ports.occupy(7104, { pid: 1, name: "wide", loopbackOnly: false });
    expect((await choose(7104))?.port).toBe(7105);
  });

  it("[RUN-PORTS-07] 回退只对这一次有效：占用者走后再选，仍是登记的端口", async () => {
    const { fake, choose } = setup();
    fake.ports.occupy(7104, { pid: 1, name: "x" });
    expect((await choose(7104))?.port).toBe(7105);
    fake.ports.release(7104);
    expect(await choose(7104)).toEqual({ port: 7104 });
  });

  it("[RUN-PORTS-08] 下一个端口登记给了别的项目就跳过，选更后面没登记的空闲端口", async () => {
    const { fake, choose } = setup();
    fake.ports.occupy(7104, { pid: 1, name: "x" });
    fake.ports.occupy(7106, { pid: 2, name: "y" });
    expect((await choose(7104, [7105]))?.port).toBe(7107);
  });

  it("被系统保留的端口：原因是 PORT_RESERVED，查不到占用者", async () => {
    const { fake, choose } = setup();
    fake.ports.reserve(7104);
    const chosen = await choose(7104);
    expect(chosen?.portFallback).toEqual({ wanted: 7104, reason: "PORT_RESERVED" });
  });

  it("走到范围末尾后绕回开头；一个都没有时返回 null", async () => {
    const { fake } = setup();
    const range = { min: 7100, max: 7102 };
    const choose = () =>
      chooseRunPort({
        platform: fake.platform,
        wanted: 7102,
        range,
        registeredByOthers: new Set<number>(),
      });
    fake.ports.occupy(7102, { pid: 1, name: "x" });
    expect((await choose())?.port).toBe(7100);
    fake.ports.occupy(7100, { pid: 1, name: "x" });
    fake.ports.occupy(7101, { pid: 1, name: "x" });
    expect(await choose()).toBeNull();
  });

  it("[RUN-PORTS-09] 命令行指定的范围外端口空闲就用它；被占用时从范围开头找，不去试范围外的", async () => {
    const { fake, choose } = setup();
    expect(await choose(7500)).toEqual({ port: 7500 });
    fake.ports.occupy(9000, { pid: 1, name: "x" });
    expect((await choose(9000))?.port).toBe(7100);
  });

  it("[RUN-PORTS-15] 显式指定的端口被占用：拒绝并带上占用者，不往后找", async () => {
    const { fake } = setup();
    fake.ports.occupy(7500, { pid: 4242, name: "python3" });
    const chosen = await chooseRunPort({
      platform: fake.platform,
      wanted: 7500,
      explicit: true,
      range: DEFAULT_PORT_RANGE,
      registeredByOthers: new Set<number>(),
    });
    expect(chosen).toEqual({
      refused: {
        port: 7500,
        reason: "PORT_OCCUPIED",
        occupant: { pid: 4242, name: "python3" },
      },
    });
  });

  it("[RUN-PORTS-15] 显式指定的端口空闲：照常使用，没有 portFallback", async () => {
    const { fake } = setup();
    const chosen = await chooseRunPort({
      platform: fake.platform,
      wanted: 7500,
      explicit: true,
      range: DEFAULT_PORT_RANGE,
      registeredByOthers: new Set<number>(),
    });
    expect(chosen).toEqual({ port: 7500 });
  });
});
