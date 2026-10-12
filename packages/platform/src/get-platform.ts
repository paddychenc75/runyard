import { homedir } from "node:os";
import { createDarwinPlatform } from "./darwin/index.ts";
import { createLinuxPlatform } from "./linux/index.ts";
import { absPath } from "./path-types.ts";
import type { Arch, Platform } from "./platform.ts";
import { platformError } from "./platform-error.ts";
import type { PlatformOptions } from "./platform-options.ts";

// 整个代码库唯一读取 process.platform 的地方（platform-branching 检查守着）。
// 别处要的是 Platform，不是系统名。

// 按系统名选实现。不支持的系统给出带代码的错误，不静默退到别的实现
export function platformFor(system: string, options: PlatformOptions): Platform {
  switch (system) {
    case "darwin":
      return createDarwinPlatform(options);
    case "linux":
      return createLinuxPlatform(options);
    default:
      throw platformError("NOT_SUPPORTED", {}, `unsupported operating system: ${system}`);
  }
}

function hostArch(): Arch {
  const arch = process.arch;
  if (arch === "x64" || arch === "arm64") return arch;
  throw platformError("NOT_SUPPORTED", {}, `unsupported cpu architecture: ${arch}`);
}

// overrides 供测试和开发版隔离用；不传就取真实的主目录，开发版由 RUNYARD_PROFILE=dev 决定
export function getPlatform(overrides: Partial<PlatformOptions> = {}): Platform {
  const options: PlatformOptions = {
    home: overrides.home ?? absPath(homedir()),
    arch: overrides.arch ?? hostArch(),
    profile: "profile" in overrides ? overrides.profile : devProfile(),
  };
  return platformFor(process.platform, options);
}

function devProfile(): "dev" | undefined {
  return process.env.RUNYARD_PROFILE === "dev" ? "dev" : undefined;
}
