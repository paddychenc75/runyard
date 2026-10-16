import { join } from "node:path";
import type { RunyardClient } from "@runyard/client";
import { type AbsPath, absPath, joinPath, type Platform, posixRelPath } from "@runyard/platform";
import { createFakePlatform, type FakePlatform } from "@runyard/testing";
import { expect, it } from "vitest";
import type { CliDeps, CliHost } from "./cli-deps.ts";
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
  /** 覆盖假的运行环境（安装来源、另一份安装的探测等） */
  host?: Partial<CliHost>;
}

export class Harness {
  readonly fake: FakePlatform = createFakePlatform();
  readonly roots = new Map<string, FakePlatform>();
  readonly connectCalls: Platform[] = [];
  readonly registry: CommandRegistry;
  readonly #connect: CliDeps["connect"] | undefined;
  readonly #host: Partial<CliHost>;

  constructor(options: HarnessOptions = {}) {
    const handlers = options.handlers ?? {};
    this.#connect = options.connect;
    this.#host = options.host ?? {};
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
    // 直接布置内存文件系统（缺的上级目录自动建）：假平台在不同系统上对路径分隔符的处理不同
    this.fake.fs.writeFile(this.cliJson, text);
  }

  /** 随应用发布的数据（内置模板、运行器、工具定义）在假文件系统里的位置 */
  get appData(): { builtinDir: AbsPath; runnersDir: AbsPath; toolsDir: AbsPath } {
    const at = (name: string) => absPath(join(this.platform.paths.home, "app-data", name));
    return { builtinDir: at("builtin"), runnersDir: at("runners"), toolsDir: at("tools") };
  }

  get tempDir(): AbsPath {
    return absPath(join(this.platform.paths.home, "tmp"));
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
      host: {
        install: { kind: "source", version: "0.0.0", path: "/fake/runyard/main.ts" },
        templates: this.appData,
        tempDir: this.tempDir,
        clock: this.fake.clock,
        probeInstall: async () => ({ kind: "app", version: null }),
        ...this.#host,
      },
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
