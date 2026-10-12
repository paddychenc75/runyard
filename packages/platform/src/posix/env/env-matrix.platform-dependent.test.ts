import { afterEach, describe, expect, it } from "vitest";
import { absPath } from "../../path-types.ts";
import { ENV_CASES, type EnvCase } from "../../test-support/env-cases.ts";
import { makeSyntheticHome, type SyntheticHome } from "../../test-support/synthetic-home.ts";
import {
  type Harness,
  makeHarness,
  shellPath,
  versionOf,
} from "../../test-support/toolchain-harness.ts";
import { isAlive } from "../../test-support/tracked-processes.ts";
import type { ShellKind } from "./login-shell.ts";

// 合成环境矩阵（证据 0009 的做法，规模见 AGENTS.md）：真实的 zsh 与 bash，假的版本管理器，
// 全在临时主目录里。每格解析一次环境，再用解析出的环境在给定的工作目录里执行假工具的版本命令。
// fish 的脚本只有单元测试（本机没有 fish，不假装验证过）。

const kinds = (["zsh", "bash"] as const).filter((kind) => shellPath(kind) !== null);

// 用例对应的规格场景编号（写进测试标题，规格要求每个 验证：test 的场景有带编号的测试）
const SCENARIO: Readonly<Record<string, string>> = {
  "nvm-default": "TOOLCHAIN-DETECTION-13",
  "nvm-lazy-function": "TOOLCHAIN-DETECTION-13",
  "rc-exits-only-noninteractive-login-works": "TOOLCHAIN-DETECTION-16",
};
const PROJECT_SCENARIO = "TOOLCHAIN-DETECTION-14";

const tag = (id: string | undefined) => (id === undefined ? "" : `[${id}] `);
const plain = (output: string | null) => output?.replace(/^v|^Python /, "") ?? null;

function applicable(testCase: EnvCase, kind: ShellKind): boolean {
  return (testCase.needs ?? []).every((need) => need === kind || shellPath(need) !== null);
}

// 个别用例还要看环境里的其他变量
const EXTRA: Readonly<Record<string, (env: Record<string, string>) => void>> = {
  "noise-marker-like-text-multiline-values": (env) => {
    expect(env.RY_MULTI).toBe("line1\nline2 __RUNYARD_ENV_0000_START__\nline3");
  },
  "huge-and-non-utf8-values": (env) => {
    expect(env.RY_HUGE).toHaveLength(100_000);
    expect(env.RY_BIN).toContain("�");
  },
};

describe.each(kinds)("合成环境矩阵：%s", (kind) => {
  let synthetic: SyntheticHome | undefined;
  let harness: Harness | undefined;

  afterEach(async () => {
    const leaked = harness?.alive() ?? [];
    const survivors = (await harness?.tracked.killAll()) ?? [];
    synthetic?.remove();
    expect(leaked).toEqual([]);
    expect(survivors).toEqual([]);
  });

  function setUp(testCase: EnvCase): Harness {
    const made = makeSyntheticHome();
    synthetic = made;
    for (const [file, content] of Object.entries(testCase.files(kind))) made.write(file, content);
    harness = makeHarness({ home: made.home, shell: shellPath(kind) as string });
    return harness;
  }

  for (const testCase of ENV_CASES.filter((candidate) => applicable(candidate, kind))) {
    const expectedSource = testCase.source ?? "login-shell";

    it(`${tag(SCENARIO[testCase.id])}${testCase.id}：主目录里得到 ${testCase.home}，来源 ${expectedSource}`, async () => {
      const h = setUp(testCase);
      const home = (synthetic as SyntheticHome).home;
      const result = await h.toolchain.env.load({ cwd: home });
      expect(result.source).toBe(expectedSource);
      expect(result.reason).toBeUndefined();
      expect(plain(await versionOf(h, result.env, home, testCase.tool))).toBe(testCase.home);
      EXTRA[testCase.id]?.(result.env);
      // 会话专属的变量不带进来
      expect(result.env.RUNYARD_RESOLVING_ENV).toBeUndefined();
    });

    for (const project of testCase.projects ?? []) {
      it(`${tag(PROJECT_SCENARIO)}${testCase.id}：项目 ${project.name} 里得到 ${project.expect}`, async () => {
        const h = setUp(testCase);
        const made = synthetic as SyntheticHome;
        for (const [file, content] of Object.entries(project.files)) {
          made.write(`${project.name}/${file}`, content);
        }
        made.write(`${project.name}/.keep`, "");
        const cwd = absPath(`${made.home}/${project.name}`);
        const result = await h.toolchain.env.load({ cwd });
        expect(result.source).toBe(expectedSource);
        expect(plain(await versionOf(h, result.env, cwd, testCase.tool))).toBe(project.expect);
      });
    }
  }

  it("后台任务占着标准输出的管道：看到结束标记就结束整个进程组，不等管道关闭", async () => {
    const made = makeSyntheticHome();
    synthetic = made;
    made.write("bin/node", "#!/bin/sh\necho v1.0.0\n");
    const rc = '(sleep 300 & echo $! > "$HOME/bg.pid")\nexport PATH="$HOME/bin:$PATH"\n';
    if (kind === "zsh") made.write(".zshrc", rc);
    else {
      made.write(".bashrc", rc);
      made.write(".bash_profile", '. "$HOME/.bashrc"\n');
    }
    harness = makeHarness({ home: made.home, shell: shellPath(kind) as string });
    const started = Date.now();
    const result = await harness.toolchain.env.load();
    expect(result.source).toBe("login-shell");
    expect(Date.now() - started).toBeLessThan(8000);
    const { readFileSync } = await import("node:fs");
    const pid = Number(readFileSync(`${made.home}/bg.pid`, "utf8"));
    harness.tracked.track(pid);
    for (let i = 0; i < 500 && isAlive(pid); i++) await new Promise((r) => setTimeout(r, 20));
    expect(isAlive(pid)).toBe(false);
  });
});
