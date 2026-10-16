import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { specEnv } from "./spec.mjs";

const SCRIPT = fileURLToPath(new URL("./spec.mjs", import.meta.url));

describe("spec 包装脚本：关掉 OpenSpec 的联网行为", () => {
  it("设上统计和版本检查的关闭开关，并保留其他环境变量", () => {
    const env = specEnv({ PATH: "/bin", FOO: "bar" });
    expect(env.OPENSPEC_TELEMETRY).toBe("0");
    expect(env.OPENSPEC_NO_UPDATE_CHECK).toBe("1");
    expect(env.DO_NOT_TRACK).toBe("1");
    expect(env.FOO).toBe("bar");
  });

  it("外面把统计设成开，也会被覆盖回关", () => {
    expect(specEnv({ OPENSPEC_TELEMETRY: "1" }).OPENSPEC_TELEMETRY).toBe("0");
    expect(specEnv({ DO_NOT_TRACK: "0" }).DO_NOT_TRACK).toBe("1");
  });

  it("不设 CI、也不设任何开关时单独跑一次，用户主目录里不写任何文件", () => {
    const home = mkdtempSync(join(tmpdir(), "runyard-spec-home-"));
    try {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: "",
        XDG_DATA_HOME: "",
      };
      for (const key of ["CI", "OPENSPEC_TELEMETRY", "OPENSPEC_NO_UPDATE_CHECK", "DO_NOT_TRACK"])
        delete env[key];
      const result = spawnSync(process.execPath, [SCRIPT, "--version"], { env, encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("1.14.0");
      expect(readdirSync(home)).toEqual([]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
