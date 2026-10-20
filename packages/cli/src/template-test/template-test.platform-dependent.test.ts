import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { absPath, getPlatform } from "@runyard/platform";
import { registerSpawned } from "@runyard/testing";
import { expect, it, vi } from "vitest";
import { tempWorkspace } from "./temp-workspace.ts";

const entry = fileURLToPath(new URL("../main.ts", import.meta.url));
const repo = realpathSync(fileURLToPath(new URL("../../../..", import.meta.url)));
async function invoke(args: string[], cancel = false) {
  const own = tempWorkspace(absPath(tmpdir()));
  const home = await own.create();
  const platform = getPlatform({ home, profile: undefined });
  try {
    mkdirSync(join(home, "root"));
    const marker = join(home, "ready.txt");
    if (cancel) {
      const folder = join(home, "root", ".runyard", "templates", "cancel-test");
      mkdirSync(join(folder, "files"), { recursive: true });
      const original = JSON.parse(
        readFileSync(join(repo, "templates", "builtin", "node-ts", "template.json"), "utf8"),
      );
      writeFileSync(
        join(folder, "template.json"),
        JSON.stringify({ ...original, id: "cancel-test" }),
      );
      writeFileSync(
        join(folder, "files", "main.ts"),
        `import {writeFileSync} from "node:fs";writeFileSync(${JSON.stringify(marker)},"ready");setInterval(()=>{},1000);`,
      );
    }
    const child = platform.exec.spawn({
      argv: [process.execPath, entry, "--root", join(home, "root"), ...args],
      cwd: absPath(repo),
      env: { PATH: process.env.PATH ?? "", HOME: home, TMPDIR: tmpdir() },
      stdin: false,
    });
    registerSpawned(platform, child.ref);
    const read = async (stream: AsyncIterable<unknown>) => {
      let out = "";
      for await (const chunk of stream) out += String(chunk);
      return out;
    };
    const output = Promise.all([read(child.stdout), read(child.stderr), child.exited]);
    if (cancel) {
      await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 3000 });
      await platform.proc.terminate(child.ref, { mode: "graceful", graceMs: 3000 });
    }
    const [stdout, stderr, exit] = await output;
    expect(stdout, `exit=${JSON.stringify(exit)} stderr=${stderr}`).not.toBe("");
    const result = JSON.parse(stdout) as {
      ok: boolean;
      keptDir?: string;
      runs: {
        toolVersions: Record<string, string>;
        steps: {
          step: string;
          ok: boolean;
          error?: { code: string; message: string; debug?: string };
        }[];
      }[];
    };
    expect(existsSync(join(home, "root", "Runyard"))).toBe(false);
    return { result, code: exit.exitCode, stderr };
  } finally {
    await own.remove(home);
  }
}
it("[TEMPLATES-FORMAT-43] [TEMPLATES-FORMAT-50] 真实HTML完整冒烟不连接管理进程或写仓库", async () => {
  const { result, code } = await invoke(["template", "test", "html", "--json"]);
  expect(code).toBe(0);
  expect(result.ok).toBe(true);
  expect(result.runs[0]?.steps.map((step) => step.step)).toEqual([
    "create",
    "install",
    "start",
    "ready",
    "reload",
    "stop",
    "leftovers",
  ]);
  expect(result.keptDir).toBeUndefined();
});
it("[TEMPLATES-FORMAT-44] [TEMPLATES-FORMAT-49] 真实Node脚本重跑，指定当前版本并保留目录", async () => {
  const { result, code } = await invoke([
    "template",
    "test",
    "node-ts",
    "--tool-version",
    `node=${process.versions.node}`,
    "--keep-dir",
    "--json",
  ]);
  expect(code).toBe(0);
  expect(result.ok).toBe(true);
  expect(result.runs[0]?.toolVersions.node).toBe(process.versions.node);
  expect(result.runs[0]?.steps.some((step) => step.step === "ready")).toBe(false);
  const kept = result.keptDir;
  expect(kept).toBeDefined();
  if (!kept) throw new Error("missing kept directory");
  const root = realpathSync(dirname(kept));
  expect(dirname(root)).toBe(realpathSync(tmpdir()));
  expect(basename(root)).toMatch(/^runyard-template-test-/);
  try {
    expect(relative(repo, kept).split(/[\\/]/)[0]).toBe("..");
    expect(readFileSync(join(kept, "main.ts"), "utf8")).toContain("runyard-smoke-");
  } finally {
    // delete-allow: 仅清理本测试子进程返回且核对过系统临时目录前缀的独占测试目录
    rmSync(root, { recursive: true, force: true });
  }
});
it("[TEMPLATES-FORMAT-49] 缺指定版本仍输出单一结果对象，退出4且JSON错误保持英文", async () => {
  const { result, code } = await invoke([
    "template",
    "test",
    "node-ts",
    "--tool-version",
    "node=99.99.99",
    "--lang",
    "zh-CN",
    "--json",
  ]);
  expect(code).toBe(4);
  expect(result.ok).toBe(false);
  const error = result.runs[0]?.steps.find((step) => !step.ok)?.error;
  expect(error?.code).toBe("TOOL_MISSING");
  expect(error?.message).not.toMatch(/[㐀-鿿]/);
  expect(error?.debug).toBeUndefined();
});

it("中断长脚本时先停止本次进程，再输出失败结果并清理", async () => {
  const { result, code } = await invoke(["template", "test", "cancel-test", "--json"], true);
  expect(code).toBe(6);
  expect(result.ok).toBe(false);
  expect(result.runs[0]?.steps.find((step) => step.step === "leftovers")?.ok).toBe(true);
});
