import { afterEach, describe, expect, it } from "vitest";
import { reapSpawned, spawnedRegistry } from "./spawned-registry.ts";

afterEach(() => spawnedRegistry().clear());

describe("遗留进程登记处", () => {
  it("还活着的登记项被结束并报出 pid，已经退出的不报", async () => {
    const killed: number[] = [];
    spawnedRegistry().add({ pid: 11, alive: () => true, kill: () => killed.push(11) });
    spawnedRegistry().add({ pid: 22, alive: () => false, kill: () => killed.push(22) });
    spawnedRegistry().add({ pid: 33, alive: async () => true, kill: () => killed.push(33) });
    expect(await reapSpawned()).toEqual([11, 33]);
    expect(killed).toEqual([11, 33]);
  });

  it("核对完清空登记处，下一个文件从零开始", async () => {
    spawnedRegistry().add({ pid: 1, alive: () => false, kill: () => undefined });
    await reapSpawned();
    expect(spawnedRegistry().size).toBe(0);
  });
});
