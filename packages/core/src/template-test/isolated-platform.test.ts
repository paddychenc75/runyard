import { absPath, joinPath, posixRelPath } from "@runyard/platform";
import { createFakePlatform } from "@runyard/testing";
import { expect, it } from "vitest";
import { isolatedPlatform } from "./isolated-platform.ts";

it("子进程不沿用父运行标记，不能把用户已有运行认成本次测试", async () => {
  const fake = createFakePlatform();
  const marked: string[] = [];
  const home = absPath("/owned/home");
  const platform = isolatedPlatform(fake.platform, home, "test-unique", undefined, (id) =>
    marked.push(id),
  );
  platform.exec.spawn({
    argv: ["node"],
    cwd: home,
    env: { RUNYARD_RUN_ID: "parent-user-run" },
    stdin: false,
  });
  expect(marked).toEqual(["test-unique-aux"]);
  expect(fake.processes.spawned[0]?.env.RUNYARD_RUN_ID).toBe("test-unique-aux");
  const loaded = await platform.env.load();
  expect(loaded.env.HOME).toBe(home);
  expect(platform.paths.stateDir).toBe(joinPath(home, posixRelPath(".runyard")));
});
it("取消后不再启动版本检测或运行进程", () => {
  const fake = createFakePlatform();
  const signal = new AbortController();
  signal.abort();
  const platform = isolatedPlatform(
    fake.platform,
    absPath("/owned/home"),
    "test-unique",
    signal.signal,
    () => {},
  );
  expect(() =>
    platform.exec.spawn({ argv: ["node"], cwd: absPath("/owned/home"), env: {}, stdin: false }),
  ).toThrow("cancelled");
  expect(fake.processes.spawned).toEqual([]);
});
