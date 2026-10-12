import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findLoginShell } from "./login-shell.ts";

describe("findLoginShell：不依赖 SHELL", () => {
  const dir = mkdtempSync(join(tmpdir(), "ry-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const make = (name: string) => {
    const file = join(dir, name);
    writeFileSync(file, "#!/bin/sh\n");
    chmodSync(file, 0o755);
    return file;
  };

  it("系统给的 shell 优先于环境变量 SHELL", async () => {
    const fromSystem = make("a-zsh");
    const fromEnv = make("b-bash");
    expect(await findLoginShell({ userInfoShell: () => fromSystem, envShell: fromEnv })).toBe(
      fromSystem,
    );
  });

  it("系统没有给（或给的不可执行）就问目录服务，再用 SHELL", async () => {
    const fromDirectory = make("c-zsh");
    const fromEnv = make("d-bash");
    expect(
      await findLoginShell({
        userInfoShell: () => "/nonexistent/zsh",
        directory: async () => fromDirectory,
        envShell: fromEnv,
      }),
    ).toBe(fromDirectory);
    expect(
      await findLoginShell({
        userInfoShell: () => undefined,
        directory: async () => undefined,
        envShell: fromEnv,
      }),
    ).toBe(fromEnv);
  });

  it("都没有就用 /bin/zsh；显式指定的直接采用", async () => {
    expect(await findLoginShell({ userInfoShell: () => undefined })).toBe("/bin/zsh");
    expect(await findLoginShell({ override: "/x/nu", userInfoShell: () => "/bin/zsh" })).toBe(
      "/x/nu",
    );
  });
});
