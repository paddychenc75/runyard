import { describe, expect, it } from "vitest";
import { portFallbackSchema, runSnapshotSchema } from "./run-snapshot.ts";
import { sampleRun } from "./sample-data.ts";

describe("RunSnapshot", () => {
  it("合法的快照通过", () => {
    expect(runSnapshotSchema.safeParse(sampleRun).success).toBe(true);
  });

  it("[RUN-PORTS-03] 脚本没有 port 和 url 也合法，必填字段缺了才被拒绝", () => {
    const script = {
      ...sampleRun,
      kind: "oneshot",
      state: "finished",
      exitCode: 0,
      durationMs: 40,
    };
    const { port: _port, url: _url, ...withoutAddress } = script;
    expect(runSnapshotSchema.safeParse(withoutAddress).success).toBe(true);
    const { runId: _runId, ...withoutId } = sampleRun;
    expect(runSnapshotSchema.safeParse(withoutId).success).toBe(false);
  });

  it("[RUN-PORTS-12] 地址只能写字面量 127.0.0.1，不能是 localhost", () => {
    expect(
      runSnapshotSchema.safeParse({ ...sampleRun, url: "http://localhost:7100" }).success,
    ).toBe(false);
    expect(runSnapshotSchema.safeParse({ ...sampleRun, url: "http://0.0.0.0:7100" }).success).toBe(
      false,
    );
  });

  it("[RUN-LIFECYCLE-12] 重复启动返回现有运行并带 alreadyRunning", () => {
    const parsed = runSnapshotSchema.parse({ ...sampleRun, alreadyRunning: true });
    expect(parsed.alreadyRunning).toBe(true);
  });

  it("[RUN-LIFECYCLE-10] 较慢的启动用可选字段 slow 表示，不带它的快照照样合法", () => {
    const slow = runSnapshotSchema.parse({ ...sampleRun, state: "starting", slow: true });
    expect(slow.slow).toBe(true);
    expect(runSnapshotSchema.safeParse({ ...sampleRun, slow: "yes" }).success).toBe(false);
    expect(runSnapshotSchema.safeParse(sampleRun).success).toBe(true);
  });

  it("状态必须是登记过的十二个之一，失败原因必须取自错误码", () => {
    expect(runSnapshotSchema.safeParse({ ...sampleRun, state: "paused" }).success).toBe(false);
    expect(
      runSnapshotSchema.safeParse({ ...sampleRun, state: "failed", reason: "TOOL_MISSING" })
        .success,
    ).toBe(true);
    expect(
      runSnapshotSchema.safeParse({ ...sampleRun, state: "failed", reason: "SCRIPT_ERRORED" })
        .success,
    ).toBe(false);
  });

  it("游标要符合 <runId>:<序号>，端口要在合法范围内", () => {
    expect(runSnapshotSchema.safeParse({ ...sampleRun, cursor: "12" }).success).toBe(false);
    expect(runSnapshotSchema.safeParse({ ...sampleRun, port: 70000 }).success).toBe(false);
  });

  it("[RUN-PORTS-06] portFallback 带原端口、原因和占用者（查得到时）", () => {
    const fallback = {
      wanted: 7104,
      reason: "PORT_OCCUPIED",
      occupant: { pid: 99, name: "python3" },
    };
    expect(portFallbackSchema.safeParse(fallback).success).toBe(true);
    expect(portFallbackSchema.safeParse({ wanted: 7104, reason: "PORT_RESERVED" }).success).toBe(
      true,
    );
    expect(portFallbackSchema.safeParse({ wanted: 7104, reason: "BUSY" }).success).toBe(false);
  });
});
