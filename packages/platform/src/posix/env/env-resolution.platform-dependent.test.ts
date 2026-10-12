import { chmodSync, existsSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { absPath } from "../../path-types.ts";
import {
  fixedTool,
  makeSyntheticHome,
  type SyntheticHome,
} from "../../test-support/synthetic-home.ts";
import { type Harness, makeHarness, shellPath } from "../../test-support/toolchain-harness.ts";
import { ENV_RESOLVE_TIMEOUT_MS } from "./resolve-env.ts";

// 解析的行为：超时、回退、不阻塞、缓存、来源。用真实的 zsh（本机没有 zsh 时用 bash，启动文件写法相同）。

const shell = (shellPath("zsh") ?? shellPath("bash")) as string;
const rcName = shell.endsWith("zsh") ? ".zshrc" : ".bashrc";

let synthetic: SyntheticHome;
let harness: Harness | undefined;

function setUp(rc: string, timeoutMs?: number, shellOverride = shell): Harness {
  synthetic = makeSyntheticHome();
  synthetic.write("bin/node", fixedTool("v20.1.0"));
  synthetic.write(rcName, rc);
  if (rcName === ".bashrc") synthetic.write(".bash_profile", '. "$HOME/.bashrc"\n');
  harness = makeHarness({
    home: synthetic.home,
    shell: shellOverride,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  return harness;
}

const PATH_LINE = 'export PATH="$HOME/bin:$PATH"\n';

afterEach(async () => {
  const survivors = (await harness?.tracked.killAll()) ?? [];
  synthetic?.remove();
  harness = undefined;
  expect(survivors).toEqual([]);
});

describe("超时与回退", () => {
  it("硬超时是 10 秒", () => {
    expect(ENV_RESOLVE_TIMEOUT_MS).toBe(10_000);
  });

  it("[TOOLCHAIN-DETECTION-15] 启动文件一直不返回：超时、整组被结束、回退并带原因，后台再试一次", async () => {
    const h = setUp(`sleep 60 &\necho $! > "$HOME/bg.pid"\nsleep 60\n${PATH_LINE}`, 1500);
    synthetic.write(".local/bin/placeholder", "");
    // refresh 为真不自动重试，所以返回时不会有第二个 shell 在跑
    const result = await h.toolchain.env.load({ refresh: true });
    expect(result.source).toBe("fallback");
    expect(result.reason).toBe("timeout");
    expect(result.ms).toBeGreaterThanOrEqual(1400);
    expect(result.ms).toBeLessThan(6000);
    // 回退用常见目录的扫描结果顶着：PATH 有系统目录和存在的常见目录
    expect(result.env.PATH).toContain("/usr/bin");
    expect(result.env.PATH).toContain(join(synthetic.home, ".local/bin"));
    // 主壳和后台任务都被结束了（不靠收尾的 killAll）
    const bg = Number(readFileSync(join(synthetic.home, "bg.pid"), "utf8"));
    h.tracked.track(bg);
    expect(h.alive()).toEqual([]);
  });

  it("[TOOLCHAIN-DETECTION-15] 第一次失败后后台再试一次：refreshing 兑现、不抛错，重试的进程也被结束", async () => {
    const h = setUp("sleep 60\n", 1000);
    const result = await h.toolchain.env.load();
    expect(result.reason).toBe("timeout");
    expect(result.refreshing).toBeDefined();
    expect(await result.refreshing).toMatchObject({ source: "fallback", reason: "timeout" });
    expect(h.alive()).toEqual([]);
  });

  it("[TOOLCHAIN-DETECTION-15] 默认硬超时 10 秒到点就结束整组", async () => {
    const h = setUp("sleep 60\n");
    const result = await h.toolchain.env.load({ refresh: true });
    expect(result.source).toBe("fallback");
    expect(result.reason).toBe("timeout");
    expect(result.ms).toBeGreaterThanOrEqual(9500);
    expect(result.ms).toBeLessThan(15_000);
    expect(h.alive()).toEqual([]);
  });

  it("[TOOLCHAIN-DETECTION-15] 启动文件慢（sleep 1）时调用方没有被阻塞：事件循环照常转", async () => {
    const h = setUp(`sleep 1\n${PATH_LINE}`);
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
    }, 20);
    const result = await h.toolchain.env.load();
    clearInterval(timer);
    expect(result.source).toBe("login-shell");
    expect(result.ms).toBeGreaterThanOrEqual(900);
    expect(ticks).toBeGreaterThan(20);
  });

  it("[TOOLCHAIN-DETECTION-17] nu、tcsh 不尝试解析：不执行它们，直接用扫描结果，来源 fallback", async () => {
    for (const name of ["nu", "tcsh"]) {
      const h = setUp("");
      const bin = synthetic.write(`sh/${name}`, `#!/bin/sh\ntouch "$HOME/${name}.ran"\n`);
      chmodSync(bin, 0o755);
      harness = makeHarness({ home: synthetic.home, shell: bin });
      const result = await harness.toolchain.env.load();
      expect(result.source).toBe("fallback");
      expect(result.reason).toBe("failed");
      expect(existsSync(join(synthetic.home, `${name}.ran`))).toBe(false);
      expect(harness.spawnCount()).toBe(0);
      expect(h.alive()).toEqual([]);
      synthetic.remove();
    }
  });

  it("每种交互方式都失败（shell 立刻退出）：回退并带 failed，很快返回", async () => {
    synthetic = makeSyntheticHome();
    const bash = synthetic.write("sh/bash", "#!/bin/sh\nexit 1\n");
    harness = makeHarness({ home: synthetic.home, shell: bash });
    const result = await harness.toolchain.env.load({ refresh: true });
    expect(result.source).toBe("fallback");
    expect(result.reason).toBe("failed");
    expect(result.ms).toBeLessThan(5000);
  });
});

describe("环境缓存", () => {
  it("[TOOLCHAIN-DETECTION-18] 命中缓存时不起进程；启动文件变了就重新解析", async () => {
    const h = setUp(PATH_LINE);
    await h.toolchain.env.load();
    const spawned = h.spawnCount();
    expect(spawned).toBeGreaterThan(0);
    const again = await h.toolchain.env.load();
    expect(again.refreshing).toBeUndefined();
    expect(h.spawnCount()).toBe(spawned);
    // 改启动文件的 mtime
    const rc = join(synthetic.home, rcName);
    writeFileSync(rc, `${PATH_LINE}export RY_NEW=1\n`);
    utimesSync(rc, new Date(), new Date(Date.now() + 5000));
    const changed = await h.toolchain.env.load();
    expect(h.spawnCount()).toBeGreaterThan(spawned);
    expect(changed.env.RY_NEW).toBe("1");
  });

  it("[TOOLCHAIN-DETECTION-12] refresh 为真时重新解析并替换缓存（platform 部分）", async () => {
    const h = setUp(PATH_LINE);
    await h.toolchain.env.load();
    const spawned = h.spawnCount();
    await h.toolchain.env.load({ refresh: true });
    expect(h.spawnCount()).toBeGreaterThan(spawned);
  });

  it("有版本文件的项目有自己的缓存项（以项目为工作目录捕获），没有版本文件的项目共用全局项", async () => {
    const h = setUp(`echo "$PWD" >> "$HOME/cwds"\n${PATH_LINE}`);
    synthetic.write("proj/.node-version", "22.0.0");
    synthetic.write("plain/readme.txt", "x");
    await h.toolchain.env.load({ cwd: absPath(join(synthetic.home, "proj")) });
    await h.toolchain.env.load({ cwd: absPath(join(synthetic.home, "plain")) });
    const afterPlain = h.spawnCount();
    await h.toolchain.env.load();
    await h.toolchain.env.load({ cwd: absPath(join(synthetic.home, "proj")) });
    expect(h.spawnCount()).toBe(afterPlain); // 都命中缓存
    const cwds = readFileSync(join(synthetic.home, "cwds"), "utf8").trim().split("\n");
    expect(cwds).toContain(join(synthetic.home, "proj"));
    expect(cwds).toContain(synthetic.home); // 无版本文件的项目用主目录
    expect(cwds).not.toContain(join(synthetic.home, "plain"));
  });

  it("启动文件能识别我们：解析时有 RUNYARD_RESOLVING_ENV=1，返回的环境里没有", async () => {
    const h = setUp(`echo "$RUNYARD_RESOLVING_ENV" > "$HOME/flag"\n${PATH_LINE}`);
    const result = await h.toolchain.env.load();
    expect(readFileSync(join(synthetic.home, "flag"), "utf8").trim()).toBe("1");
    expect(result.env.RUNYARD_RESOLVING_ENV).toBeUndefined();
  });
});

describe("查找与扫描", () => {
  it("[TOOLCHAIN-DETECTION-19] 往 PATH 已有的目录装新工具：不重新解析环境就能找到", async () => {
    const h = setUp(PATH_LINE);
    const { env } = await h.toolchain.env.load();
    const spawned = h.spawnCount();
    expect(await h.toolchain.tools.candidates("ry-newtool", env)).toEqual([]);
    synthetic.write("bin/ry-newtool", fixedTool("1.0.0"));
    const found = await h.toolchain.tools.candidates("ry-newtool", env);
    expect(found).toEqual([{ path: join(synthetic.home, "bin/ry-newtool"), origin: "env-path" }]);
    expect(h.spawnCount()).toBe(spawned);
  });

  it("[TOOLCHAIN-DETECTION-20] 解析成功时以解析的环境为准；扫描到的只作为 known-location 标明来源", async () => {
    const h = setUp(PATH_LINE);
    synthetic.write(".local/bin/node", fixedTool("v99.0.0"));
    const result = await h.toolchain.env.load();
    expect(result.source).toBe("login-shell");
    expect(result.env.PATH).not.toContain(join(synthetic.home, ".local/bin"));
    const found = await h.toolchain.tools.candidates("node", result.env);
    expect(found[0]).toEqual({ path: join(synthetic.home, "bin/node"), origin: "env-path" });
    expect(found).toContainEqual({
      path: join(synthetic.home, ".local/bin/node"),
      origin: "known-location",
    });
  });

  it("packageManagers：按偏好顺序列出解析环境里有的包管理器", async () => {
    const h = setUp(PATH_LINE);
    synthetic.write("bin/npm", fixedTool("10.0.0"));
    synthetic.write("bin/pnpm", fixedTool("11.0.0"));
    expect(await h.toolchain.tools.packageManagers()).toEqual(
      expect.arrayContaining(["pnpm", "npm"]),
    );
    const names = await h.toolchain.tools.packageManagers();
    expect(names.indexOf("pnpm")).toBeLessThan(names.indexOf("npm"));
  });

  it("shell.interactive：登录 shell 排第一，不重复", async () => {
    const h = setUp(PATH_LINE);
    const shells = await h.toolchain.shell.interactive({});
    expect(shells[0]?.path).toBe(shell);
    expect(new Set(shells.map((s) => s.path)).size).toBe(shells.length);
  });

  it("[TOOLCHAIN-DETECTION-03] runDefaults 关闭 uv 和 Go 的自动下载", () => {
    const h = setUp("");
    expect(h.toolchain.env.runDefaults()).toMatchObject({
      UV_PYTHON_DOWNLOADS: "never",
      GOTOOLCHAIN: "local",
    });
  });
});
