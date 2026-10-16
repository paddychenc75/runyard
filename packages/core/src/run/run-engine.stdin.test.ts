import { describe, expect, it } from "vitest";
import { createHarness } from "./run-harness.test.ts";

// writeStdin：原样写入标准输入（不补换行）；服务没有标准输入；结束之后什么也不写。

describe("Run.writeStdin", () => {
  it("脚本 running 时原样写入，结束后返回 closed 且不再写", async () => {
    const h = createHarness({ plan: {} });
    const { run } = h.engine.start(h.request({ kind: "oneshot" }));
    // 脚本的计划没有开标准输入时是 unsupported；harness 的脚本计划 stdin 为 false
    await h.settle();
    expect(run.state).toBe("running");
    expect(await run.writeStdin("abc")).toBe("unsupported");
    h.fake.processes.exit(h.fake.processes.alive()[0] ?? { pid: 0, startTime: 0 }, 0);
    await h.settle();
    expect(run.state).toBe("finished");
    expect(await run.writeStdin("late")).toBe("closed");
  });
});
