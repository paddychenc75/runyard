import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { absPath, getPlatform } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { buildTerminalEnv } from "./terminal-env.ts";

// 规格 DESKTOP-TERMINAL-09：用户没装命令行工具、系统 PATH 里没有 runyard，终端里也能执行 runyard --version。
// 这里用终端实际用的环境（buildTerminalEnv）加一个只存在于“应用自带目录”的启动脚本，
// 在 sh 里按名字执行，证明靠的是 PATH 最前面的那个目录。

const CLI_ENTRY = fileURLToPath(new URL("../../../../packages/cli/src/main.ts", import.meta.url));
const CLI_VERSION = (
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../../packages/cli/package.json", import.meta.url)),
      "utf8",
    ),
  ) as { version: string }
).version;

async function collect(stream: AsyncIterable<unknown>): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += String(chunk);
  return text;
}

describe("终端里的 runyard 命令", () => {
  it("[DESKTOP-TERMINAL-09] 系统 PATH 里没有 runyard，终端环境下 runyard --version 输出应用的版本号，退出码 0", async () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-term-")));
    const binDir = join(home, "app-bin");
    mkdirSync(binDir);
    // 应用安装包里的 bin/runyard 也是这样的转发脚本，只是指向应用自带的命令行
    const script = join(binDir, "runyard");
    writeFileSync(script, `#!/bin/sh\nexec "${process.execPath}" "${CLI_ENTRY}" "$@"\n`);
    chmodSync(script, 0o755);

    const env = buildTerminalEnv({
      base: { PATH: "/usr/bin:/bin", HOME: home },
      extra: {},
      shell: "/bin/sh",
      runyardBinDir: binDir,
    });
    const platform = getPlatform({ home: absPath(home), profile: undefined });
    // 先证明没有这个目录就找不到：排除“系统 PATH 里本来就有 runyard”
    const without = platform.exec.spawn({
      argv: ["/bin/sh", "-c", "command -v runyard"],
      cwd: absPath(home),
      stdin: false,
      env: { PATH: "/usr/bin:/bin" },
    });
    expect((await without.exited).exitCode).not.toBe(0);

    const child = platform.exec.spawn({
      argv: ["/bin/sh", "-c", "runyard --version"],
      cwd: absPath(home),
      stdin: false,
      env: { ...env, HOME: home },
    });
    const [stdout, exit] = await Promise.all([collect(child.stdout), child.exited]);
    expect(exit.exitCode).toBe(0);
    expect(stdout).toBe(`${CLI_VERSION}\n`);
  });
});
