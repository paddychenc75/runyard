import { type AbsPath, absPath } from "@runyard/platform";
import type { Requires, ToolchainFile, ToolDefinition } from "@runyard/protocol";
import { createFakePlatform } from "@runyard/testing";
import { expect, it } from "vitest";
import { ToolchainService } from "./toolchain-service.ts";

// 工具链测试共用的现场：假平台（假进程、假环境、假时钟）、几份工具定义、记录 toolchain.changed 的出口。
// 放在 *.test.ts 里是因为只有测试文件能导入 @runyard/testing。

function definition(
  id: string,
  args: string[],
  pattern: string,
  supported: string,
): ToolDefinition {
  return {
    formatVersion: 1,
    id,
    supported,
    detect: { args, pattern },
    install: { darwin: { url: `https://example.com/${id}` } },
  };
}

export const definitions = new Map<string, ToolDefinition>([
  ["node", definition("node", ["--version"], "v(\\d+\\.\\d+\\.\\d+)", ">=20.19 <27")],
  ["pnpm", definition("pnpm", ["--version"], "(\\d+\\.\\d+\\.\\d+)", ">=10 <12")],
  ["npm", definition("npm", ["--version"], "(\\d+\\.\\d+\\.\\d+)", ">=10 <12")],
  ["go", definition("go", ["version"], "go version go(\\d+\\.\\d+(?:\\.\\d+)?)", ">=1.24 <2")],
  [
    "python",
    {
      ...definition("python", ["--version"], "Python (\\d+\\.\\d+\\.\\d+)", ">=3.12 <3.15"),
      executables: ["python3", "python"],
    },
  ],
]);

export const project = absPath("/fake/project");

export function nodeOnly(range = ">=20.19 <27"): Requires {
  return { node: { version: range } };
}

export function createToolchainHarness(
  options: { toolPaths?: Record<string, string>; initialCache?: ToolchainFile } = {},
) {
  const fake = createFakePlatform();
  const changed: number[] = [];
  const cacheWrites: ToolchainFile[] = [];
  const toolPaths: Record<string, string> = { ...options.toolPaths };
  const service = new ToolchainService({
    platform: fake.platform,
    clock: fake.clock,
    definitions,
    toolPaths: () => toolPaths,
    onChanged: () => changed.push(fake.clock.now()),
    onCacheChange: (file) => cacheWrites.push(file),
    ...(options.initialCache === undefined ? {} : { initialCache: options.initialCache }),
  });
  /** 到目前为止执行过的命令（含参数） */
  const spawnedArgv = (): string[][] => fake.processes.spawned.map((record) => [...record.argv]);
  return { fake, service, changed, cacheWrites, toolPaths, spawnedArgv };
}

export const fakePath = (tool: string): AbsPath => absPath(`/fake/bin/${tool}`);

/** 等一个依赖假进程输出的操作完成：假时钟没人推就不会前进，所以边等边推 */
export async function resolveWith<T>(
  h: ReturnType<typeof createToolchainHarness>,
  promise: Promise<T>,
): Promise<T> {
  let done = false;
  const guarded = promise.finally(() => {
    done = true;
  });
  for (let i = 0; i < 200 && !done; i++) {
    await h.fake.clock.advance(50);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return guarded;
}

it("harness：假工具表和假进程配合，版本命令能跑出输出", async () => {
  const h = createToolchainHarness();
  h.fake.tools.install("node", { version: "24.21.0" });
  const result = await resolveWith(h, h.service.check({ requires: nodeOnly() }));
  expect(result.tools[0]?.version).toBe("24.21.0");
});
