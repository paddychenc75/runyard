import type { Platform, ProcRef } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { killTerminal } from "./kill-terminal.ts";

function fakePlatform(strays: ProcRef[], failTerminate = false, peers: ProcRef[] = []) {
  const terminated: ProcRef[] = [];
  const asked: { name: string; value: string }[] = [];
  const platform = {
    proc: {
      terminate: async (ref: ProcRef) => {
        terminated.push(ref);
        if (failTerminate) throw new Error("gone");
      },
      terminalMembers: async (ref: ProcRef) => [ref, ...peers],
      findByMarker: async (marker: { name: string; value: string }) => {
        asked.push(marker);
        return strays;
      },
    },
  } as unknown as Pick<Platform, "proc">;
  return { platform, terminated, asked };
}

describe("收拾一个终端留下的进程", () => {
  it("先整组结束 shell，再按终端标记找到脱离进程组的后代逐个结束", async () => {
    const stray = { pid: 99, startTime: 5 };
    const { platform, terminated, asked } = fakePlatform([stray]);
    await killTerminal(platform, { ref: { pid: 10, startTime: 1 }, marker: "m-1" });
    expect(terminated).toEqual([{ pid: 10, startTime: 1 }, stray]);
    expect(asked).toEqual([{ name: "RUNYARD_TERMINAL", value: "m-1" }]);
  });

  it("#340 结束 shell 之前取到的终端成员（nohup 的后台作业）也被结束", async () => {
    const job = { pid: 77, startTime: 4 };
    const { platform, terminated } = fakePlatform([], false, [job]);
    await killTerminal(platform, { ref: { pid: 10, startTime: 1 }, marker: "m-1" });
    expect(terminated).toContainEqual(job);
  });

  it("shell 的身份没记下（启动时间未知）：只按标记找", async () => {
    const stray = { pid: 99, startTime: 5 };
    const { platform, terminated } = fakePlatform([stray]);
    await killTerminal(platform, { ref: null, marker: "m-1" });
    expect(terminated).toEqual([stray]);
  });

  it("某一步失败不拦着后面的：进程已经没了不算错", async () => {
    const stray = { pid: 99, startTime: 5 };
    const { platform, terminated } = fakePlatform([stray], true);
    await expect(
      killTerminal(platform, { ref: { pid: 10, startTime: 1 }, marker: "m-1" }),
    ).resolves.toBeUndefined();
    expect(terminated).toHaveLength(2);
  });
});
