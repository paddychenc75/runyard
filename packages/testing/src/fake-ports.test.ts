import { describe, expect, it } from "vitest";
import { createFakePlatform } from "./fake-platform.ts";

describe("假端口", () => {
  it("空闲、被占用（带占用者）、保留三种状态", async () => {
    const { platform, ports } = createFakePlatform();
    expect(await platform.ports.isFree(7100)).toBe("free");
    ports.occupy(7100, { pid: 42, name: "node", connections: 2, loopbackOnly: false });
    expect(await platform.ports.isFree(7100)).toBe("in-use");
    expect(await platform.ports.occupant(7100)).toEqual({ pid: 42, name: "node" });
    expect(await platform.ports.connections(7100)).toBe(2);
    expect(await platform.ports.loopbackOnly(7100)).toBe(false);
    ports.reserve(80);
    expect(await platform.ports.isFree(80)).toBe("reserved");
    expect(await platform.ports.occupant(7101)).toBeNull();
  });

  it("过一段假时间才变空闲", async () => {
    const { platform, ports, clock } = createFakePlatform();
    ports.occupy(7100, { pid: 1, name: "x" });
    ports.releaseAfter(7100, 2000);
    await clock.advance(1999);
    expect(await platform.ports.isFree(7100)).toBe("in-use");
    await clock.advance(1);
    expect(await platform.ports.isFree(7100)).toBe("free");
  });
});
