import { readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { RunyardClient } from "@runyard/client";
import { clientError } from "@runyard/client";
import { absPath } from "@runyard/platform";
import { afterEach, describe, expect, it } from "vitest";
import type { CliHost } from "../cli-deps.ts";
import { Harness } from "../cli-harness.test.ts";
import { readZip } from "../doctor/zip-writer.test.ts";

const open: Harness[] = [];
type Body = Record<string, unknown>;
const info = { protocol: 1, version: "0.1.0", build: "b1", startedBy: "cli", runs: 2 };

function harness(
  options: { supervisor?: boolean; startFailure?: "PATH_TOO_LONG"; host?: Partial<CliHost> } = {},
): Harness {
  const client = {
    call: async (method: string) => {
      if (method === "supervisor.info") return info;
      throw new Error(`unexpected call ${method}`);
    },
    close: () => undefined,
  } as unknown as RunyardClient;
  const connect =
    options.supervisor === false
      ? async () => {
          throw clientError(
            "SUPERVISOR_UNAVAILABLE",
            options.startFailure === undefined ? {} : { reason: options.startFailure },
            "cannot start",
          );
        }
      : async () => client;
  const h = new Harness({ connect, ...(options.host === undefined ? {} : { host: options.host }) });
  open.push(h);
  // 真实的六份工具定义放进假文件系统：安装提示就是从它们来的
  for (const id of ["node", "npm", "pnpm", "python", "uv", "go"]) {
    const text = readFileSync(
      new URL(`../../../../templates/tools/${id}.json`, import.meta.url),
      "utf8",
    );
    h.fake.fs.writeFile(absPath(join(h.appData.toolsDir, `${id}.json`)), text);
  }
  return h;
}
afterEach(async () => {
  for (const h of open.splice(0)) await h.dispose();
});

const state = (h: Harness, path: string) => absPath(join(h.platform.paths.stateDir, path));

describe("doctor", () => {
  it("[CLI-COMMANDS-63] 基本诊断：五个键齐全，supervisor.running 是 true", async () => {
    const h = harness();
    h.fake.tools.install("node", { version: "24.1.0" });
    const result = await h.run(["doctor", "--json"]);
    expect(result.code).toBe(0);
    const body = h.json(result) as Body;
    expect(Object.keys(body).sort()).toEqual(["cli", "library", "supervisor", "system", "tools"]);
    expect(body.supervisor).toEqual({ running: true, ...info });
    expect(body.cli).toMatchObject({ version: "0.0.0", kind: "source", other: null });
    expect(body.library).toEqual({ root: h.platform.paths.defaultLibrary });
    expect(body.system).toEqual({ os: "darwin", version: "25.0.0", arch: h.platform.arch });
    const tools = body.tools as { tool: string; status: string; path?: string; version?: string }[];
    expect(tools.find((t) => t.tool === "node")).toMatchObject({
      status: "found",
      version: "24.1.0",
    });
    expect(tools.find((t) => t.tool === "go")).toMatchObject({ status: "missing" });
  });

  it("[CLI-COMMANDS-23] 管理进程不可用时照常输出其余部分，退出码 0", async () => {
    const h = harness({ supervisor: false });
    const result = await h.run(["doctor", "--json"]);
    expect(result.code).toBe(0);
    const body = h.json(result) as Body;
    expect(body.supervisor).toEqual({ running: false, reason: "SUPERVISOR_UNAVAILABLE" });
    for (const key of ["cli", "tools", "library", "system"]) expect(body[key], key).toBeDefined();
  });

  it("[CLI-COMMANDS-90] 管理进程因路径过长起不来：json 里有 startFailure，文字输出写明原因（中英文）", async () => {
    const h = harness({ supervisor: false, startFailure: "PATH_TOO_LONG" });
    const json = await h.run(["doctor", "--json"]);
    expect(json.code).toBe(0);
    expect((h.json(json) as Body).supervisor).toEqual({
      running: false,
      reason: "SUPERVISOR_UNAVAILABLE",
      startFailure: "PATH_TOO_LONG",
    });
    const zh = await h.run(["doctor", "--lang", "zh-CN"]);
    expect(zh.code).toBe(0);
    expect(zh.stdout).toContain("启动失败：连接文件路径超过系统允许的长度");
    const en = await h.run(["doctor", "--lang", "en"]);
    expect(en.stdout).toContain("It failed to start: the connection file path is longer");
  });

  it("文字输出：中英文都有管理进程、工具和资源库各一行", async () => {
    const h = harness();
    h.fake.tools.install("node", { version: "24.1.0" });
    const zh = await h.run(["doctor", "--lang", "zh-CN"]);
    expect(zh.stdout).toContain("管理进程：运行中");
    expect(zh.stdout).toContain("node：24.1.0");
    const en = await h.run(["doctor", "--lang", "en"]);
    expect(en.stdout).toContain("Background process: running");
    expect(en.stdout).toContain("Library:");
  });

  function addTemplate(h: Harness, id: string, requires: Record<string, unknown>) {
    h.fake.fs.writeFile(
      absPath(join(h.appData.builtinDir, id, "template.json")),
      JSON.stringify({ id, requires }),
    );
  }

  it("[CLI-COMMANDS-64] --template 只检测该模板需要的工具", async () => {
    const h = harness();
    addTemplate(h, "react19", {
      node: { version: ">=22.18 <27" },
      pnpm: { version: ">=10 <12", fallback: "npm" },
    });
    const result = await h.run(["doctor", "--template", "react19", "--json"]);
    const tools = (h.json(result).tools as { tool: string }[]).map((t) => t.tool).sort();
    expect(tools).toEqual(["node", "pnpm"]);
    expect(tools).not.toContain("go");
  });

  it("--template 找不到：TEMPLATE_NOT_FOUND，退出码 3", async () => {
    const h = harness();
    const result = await h.run(["doctor", "--template", "nope", "--json"]);
    expect(result.code).toBe(3);
    expect(h.json(result).error).toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
  });

  it("[CLI-COMMANDS-67] PATH 上还有另一种安装：other 写明它的 kind、version、path", async () => {
    const h = harness({
      host: { probeInstall: async () => ({ kind: "app", version: "1.2.0" }) },
    });
    const bin = join("/Applications", "Runyard.app", "bin");
    h.fake.fs.writeFile(absPath(join(bin, "runyard")), "#!/bin/sh\n");
    const result = await h.run(["doctor", "--json"], {
      PATH: [join("/usr", "bin"), bin].join(delimiter),
    });
    expect((h.json(result).cli as { other: unknown }).other).toEqual({
      kind: "app",
      version: "1.2.0",
      path: join(bin, "runyard"),
    });
  });

  it("PATH 上只有同一种安装时 other 是 null", async () => {
    const h = harness({
      host: { probeInstall: async () => ({ kind: "source", version: "0.0.0" }) },
    });
    const local = join("/usr", "local", "bin");
    h.fake.fs.writeFile(absPath(join(local, "runyard")), "#!/bin/sh\n");
    const result = await h.run(["doctor", "--json"], { PATH: local });
    expect((h.json(result).cli as { other: unknown }).other).toBeNull();
  });

  it("[TEMPLATES-FORMAT-36] 用户模板自己写的安装方式出现在 doctor 里，只展示，没有执行任何东西", async () => {
    const h = harness();
    addTemplate(h, "zig-demo", {
      zig: {
        version: ">=0.13",
        install: { command: ["brew", "install", "zig"], url: "https://ziglang.org/download" },
      },
    });
    const result = await h.run(["doctor", "--template", "zig-demo", "--json"]);
    const zig = (
      h.json(result).tools as { tool: string; status: string; install?: unknown[] }[]
    ).find((t) => t.tool === "zig");
    expect(zig?.status).toBe("missing");
    expect(zig?.install).toContainEqual({
      via: "template",
      command: ["brew", "install", "zig"],
      url: "https://ziglang.org/download",
    });
    const text = await h.run(["doctor", "--template", "zig-demo"]);
    expect(text.stdout).toContain("brew install zig");
    // 假平台记录了所有被启动的进程：除了版本探测，没有人运行 brew
    expect(h.fake.processes.spawned.some((p) => p.argv.includes("brew"))).toBe(false);
  });

  it("缺 node 时安装提示按环境选：有 nvm 给 nvm 的命令，只有官网链接始终在", async () => {
    const h = harness();
    h.fake.fs.writeFile(absPath(join(h.platform.paths.home, ".nvm", "nvm.sh")), "");
    const result = await h.run(["doctor", "--json"]);
    const node = (
      h.json(result).tools as {
        tool: string;
        install?: { via: string; command?: string[]; url?: string }[];
      }[]
    ).find((t) => t.tool === "node");
    expect(node?.install?.[0]).toMatchObject({ via: "versionManager", manager: "nvm" });
    expect(node?.install?.at(-1)).toMatchObject({ via: "official" });
  });
});

describe("doctor --bundle", () => {
  const TOKEN = "d4c3b2a1".repeat(8);
  const PROXY = "http://user:secret@proxy.example:8080";

  async function bundle(h: Harness) {
    const result = await h.run(["doctor", "--bundle", "--json"]);
    expect(result.code).toBe(0);
    const body = h.json(result) as { bundle: string; files: string[] };
    const bytes = await h.platform.fs.readBytes(absPath(body.bundle));
    expect(bytes).not.toBeNull();
    return { body, files: readZip(bytes ?? new Uint8Array()) };
  }

  function seed(h: Harness) {
    h.fake.fs.writeFile(
      state(h, "run/supervisor.json"),
      JSON.stringify({ formatVersion: 1, pid: 42, token: TOKEN, version: "0.1.0" }),
    );
    h.fake.fs.writeFile(state(h, "settings.json"), JSON.stringify({ network: { proxy: PROXY } }));
    h.fake.fs.writeFile(state(h, "state/toolchain.json"), '{"formatVersion":1,"entries":{}}');
    h.fake.fs.writeFile(state(h, "logs/supervisor.log"), `using proxy ${PROXY}\nhandshake ok\n`);
    h.fake.fs.writeFile(state(h, "logs/app.log"), `token seen ${TOKEN}\n`);
  }

  it("[CLI-COMMANDS-65] 诊断包里没有握手口令，也没有代理地址里的账号和密码", async () => {
    const h = harness();
    seed(h);
    const { files } = await bundle(h);
    expect(files.size).toBeGreaterThan(0);
    for (const [name, text] of files) {
      expect(text, name).not.toContain(TOKEN);
      expect(text, name).not.toContain("secret");
      expect(text, name).not.toMatch(/\buser:/);
    }
    // 代理的主机和端口可以保留
    expect(files.get("supervisor.log")).toContain("http://proxy.example:8080");
    expect(JSON.parse(files.get("supervisor.json") ?? "{}")).not.toHaveProperty("token");
  });

  it("[CLI-COMMANDS-66] 诊断包含规格列出的各项，运行日志只有最近 3 个", async () => {
    const h = harness();
    seed(h);
    for (let n = 1; n <= 5; n++)
      h.fake.fs.writeFile(state(h, `logs/run-0${n}.ndjson`), `run ${n}\n`);
    const { body, files } = await bundle(h);
    expect([...files.keys()].sort()).toEqual(
      [
        "app.log",
        "doctor.json",
        "runs/run-03.ndjson",
        "runs/run-04.ndjson",
        "runs/run-05.ndjson",
        "supervisor.json",
        "supervisor.log",
        "system.json",
        "toolchain.json",
      ].sort(),
    );
    expect([...body.files].sort()).toEqual([...files.keys()].sort());
    expect(JSON.parse(files.get("system.json") ?? "{}")).toEqual({
      os: "darwin",
      version: "25.0.0",
      arch: h.platform.arch,
    });
    expect(JSON.parse(files.get("doctor.json") ?? "{}")).toHaveProperty("tools");
  });

  it("诊断包只写到系统临时目录下，不收设置文件", async () => {
    const h = harness();
    seed(h);
    const { body, files } = await bundle(h);
    expect(body.bundle.startsWith(h.tempDir)).toBe(true);
    expect(body.bundle).toMatch(/runyard-doctor-.*\.zip$/);
    expect(files.has("settings.json")).toBe(false);
  });
});
