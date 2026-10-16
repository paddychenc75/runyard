import type { RunyardClient } from "@runyard/client";
import { type AbsPath, joinPath, type Platform, posixRelPath } from "@runyard/platform";
import { createFakePlatform, type FakePlatform } from "@runyard/testing";
import { expect, it } from "vitest";
import type { CliDeps } from "./cli-deps.ts";
import type { CommandHandler, CommandRegistry } from "./commands/command-spec.ts";
import { builtinRegistry } from "./commands/declarations.ts";
import { runCli } from "./run-cli.ts";

// 命令行单元测试共用的现场：假平台（内存文件系统，主目录是 /fake-home）、收集输出的假输出流、
// 可以替换命令实现的命令表。放在 *.test.ts 里是因为只有测试文件能导入 @runyard/testing。
// 所有测试都不碰真实的 ~/Runyard 和 ~/.runyard。

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface HarnessOptions {
  /** 按命令词（如 "run"、"config get"）换掉命令的实现，用来制造成功、失败和意外异常 */
  handlers?: Readonly<Record<string, CommandHandler>>;
  /** 连管理进程；默认调用即失败，用来证明“没有连” */
  connect?: CliDeps["connect"];
}

export class Harness {
  readonly fake: FakePlatform = createFakePlatform();
  readonly roots = new Map<string, FakePlatform>();
  readonly connectCalls: Platform[] = [];
  readonly registry: CommandRegistry;
  readonly #connect: CliDeps["connect"] | undefined;

  constructor(options: HarnessOptions = {}) {
    const handlers = options.handlers ?? {};
    this.#connect = options.connect;
    this.registry = {
      groups: builtinRegistry.groups,
      commands: builtinRegistry.commands.map((command) => {
        const run = handlers[command.name];
        return run === undefined ? command : { ...command, run };
      }),
    };
  }

  get platform(): Platform {
    return this.fake.platform;
  }

  get cliJson(): AbsPath {
    return joinPath(this.platform.paths.stateDir, posixRelPath("cli.json"));
  }

  async writeCliJson(text: string): Promise<void> {
    await this.platform.fs.makeDir(this.platform.paths.stateDir);
    await this.platform.fs.writeAtomic(this.cliJson, text);
  }

  deps(): CliDeps {
    return {
      createPlatform: (root) => {
        if (root === undefined) return this.fake.platform;
        let fake = this.roots.get(root);
        if (fake === undefined) {
          fake = createFakePlatform({ home: root });
          this.roots.set(root, fake);
        }
        return fake.platform;
      },
      connect: async (platform) => {
        this.connectCalls.push(platform);
        if (this.#connect === undefined) throw new Error("connect must not be called here");
        return this.#connect(platform);
      },
      now: () => 1_760_000_000_000,
      registry: this.registry,
    };
  }

  async run(args: readonly string[], env: Record<string, string> = {}): Promise<RunResult> {
    let stdout = "";
    let stderr = "";
    const code = await runCli(
      {
        argv: args,
        env,
        cwd: "/fake-cwd",
        stdout: { write: (chunk) => (stdout += chunk) },
        stderr: { write: (chunk) => (stderr += chunk) },
      },
      this.deps(),
    );
    return { code, stdout, stderr };
  }

  /** stdout 整体解析为一个 JSON 对象；多余的字符会让 JSON.parse 抛错 */
  json(result: RunResult): Record<string, unknown> {
    return JSON.parse(result.stdout) as Record<string, unknown>;
  }

  async dispose(): Promise<void> {
    await this.fake.dispose();
    for (const fake of this.roots.values()) await fake.dispose();
  }
}

export type { RunyardClient };

it("harness: 假现场里能跑一次 --help", async () => {
  const harness = new Harness();
  const result = await harness.run(["--help"]);
  expect(result.code).toBe(0);
  await harness.dispose();
});
