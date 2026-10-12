import { absPath } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { createFakePlatform } from "./fake-platform.ts";

const cwd = absPath("/fake/project");

async function versionOutput(fake: ReturnType<typeof createFakePlatform>, argv: string[]) {
  const proc = fake.platform.exec.spawn({ argv, cwd, env: {}, stdin: false });
  const chunks: Buffer[] = [];
  for await (const chunk of proc.stdout) chunks.push(chunk as Buffer);
  return { text: Buffer.concat(chunks).toString("utf8"), exit: (await proc.exited).exitCode };
}

describe("假工具表", () => {
  it("找到：which、candidates 和版本命令的输出都对得上；Go 用 version", async () => {
    const fake = createFakePlatform();
    const node = fake.tools.install("node", { version: "24.21.0" });
    const go = fake.tools.install("go", { version: "1.26.0" });
    expect(await fake.platform.exec.which("node", {}, cwd)).toBe(node);
    expect(await fake.platform.tools.candidates("go", {})).toEqual([
      { path: go, origin: "env-path" },
    ]);
    expect(await versionOutput(fake, [node, "--version"])).toEqual({ text: "v24.21.0\n", exit: 0 });
    expect((await versionOutput(fake, [go, "version"])).text).toBe(
      "go version go1.26.0 darwin/arm64\n",
    );
  });

  it("缺失：which 为 null，candidates 为空", async () => {
    const fake = createFakePlatform();
    fake.tools.install("go", { version: "1.26.0" });
    fake.tools.missing("go");
    expect(await fake.platform.exec.which("go", {}, cwd)).toBeNull();
    expect(await fake.platform.tools.candidates("go", {})).toEqual([]);
  });

  it("文件在但版本命令失败，或输出解析不出版本", async () => {
    const fake = createFakePlatform();
    const bad = fake.tools.install("python", { version: "0", versionCommandFails: true });
    expect((await versionOutput(fake, [bad, "--version"])).exit).toBe(1);
    const odd = fake.tools.install("ruby", { version: "0", versionOutput: "not a version\n" });
    expect((await versionOutput(fake, [odd, "--version"])).text).toBe("not a version\n");
  });

  it("版本按工作目录变化，只在特定环境下可见", async () => {
    const fake = createFakePlatform();
    const path = fake.tools.install("node", {
      version: (dir) => (dir.endsWith("pinned") ? "20.0.0" : "24.0.0"),
      visibleWhen: (env) => env.NVM_DIR !== undefined,
    });
    expect(await fake.platform.exec.which("node", {}, cwd)).toBeNull();
    expect(await fake.platform.exec.which("node", { NVM_DIR: "/x" }, cwd)).toBe(path);
    const run = async (dir: string) =>
      fake.platform.exec.spawn({
        argv: [path, "--version"],
        cwd: absPath(dir),
        env: {},
        stdin: false,
      });
    const chunks: Buffer[] = [];
    for await (const chunk of (await run("/fake/pinned")).stdout) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("v20.0.0\n");
  });
});

describe("假环境解析", () => {
  it("默认是登录 shell 的结果；degraded、fallback 改来源；记录调用参数", async () => {
    const fake = createFakePlatform();
    expect((await fake.platform.env.load({ cwd })).source).toBe("login-shell");
    fake.env.degraded();
    expect((await fake.platform.env.load({ refresh: true })).source).toBe("login-shell-degraded");
    fake.env.fallback({ PATH: "/opt/homebrew/bin" });
    expect(await fake.platform.env.load()).toEqual({
      env: { PATH: "/opt/homebrew/bin" },
      source: "fallback",
      ms: 10_000,
    });
    expect(fake.env.loadCalls).toEqual([{ cwd }, { refresh: true }, {}]);
  });

  it("hold 让 load 一直等，直到放行；调用方此时没有被别的东西阻塞", async () => {
    const fake = createFakePlatform();
    const gate = fake.env.hold();
    let source: string | undefined;
    const pending = fake.platform.env.load().then((r) => {
      source = r.source;
    });
    await fake.clock.advance(60_000);
    expect(source).toBeUndefined();
    gate.release({ source: "login-shell" });
    await pending;
    expect(source).toBe("login-shell");
  });
});
