import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runBundledCli } from "./run-bundled-cli.ts";

// 用真的 Node 进程当“随包命令行”，入口脚本把它看到的环境原样打出来。
describe("runBundledCli", () => {
  const dir = mkdtempSync(join(tmpdir(), "rbc-"));
  const entry = join(dir, "probe.mjs");
  writeFileSync(
    entry,
    `process.stdout.write(JSON.stringify({ runAsNode: process.env.ELECTRON_RUN_AS_NODE, home: process.env.HOME, tmp: process.env.TMPDIR, cwd: process.cwd(), args: process.argv.slice(2), stdinClosed: await new Promise((r) => { process.stdin.on("end", () => r(true)); process.stdin.resume(); }) }));`,
  );

  it("[DESKTOP-SETTINGS-22] 子进程带着 ELECTRON_RUN_AS_NODE、临时目录和主目录，标准输入是关的，退出码和输出都拿得到", async () => {
    const run = await runBundledCli({
      execPath: process.execPath,
      entry,
      args: ["doctor", "--bundle", "--json"],
      home: dir,
      parentEnv: { PATH: process.env.PATH, TMPDIR: "/some/tmp" },
    });
    expect(run.code).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      runAsNode: "1",
      home: dir,
      tmp: "/some/tmp",
      args: ["doctor", "--bundle", "--json"],
      stdinClosed: true,
    });
  });

  it("[DESKTOP-SETTINGS-22] 起不来时返回非零退出码而不是一直等", async () => {
    const run = await runBundledCli({
      execPath: join(dir, "missing"),
      entry,
      args: [],
      home: dir,
      parentEnv: {},
    });
    expect(run.code).not.toBe(0);
  });
});
