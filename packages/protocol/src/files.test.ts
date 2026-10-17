import { describe, expect, it } from "vitest";
import { type FileFormat, readVersioned, serializeVersioned } from "./file-format.ts";
import { libraryFileFormat } from "./file-library.ts";
import { playgroundFileFormat } from "./file-playground.ts";
import { cliFileFormat, effectiveCliLocale, settingsFileFormat } from "./file-settings.ts";
import { redactSupervisorFile, runRecordFormat, supervisorFileFormat } from "./file-supervisor.ts";
import {
  isToolchainCacheFresh,
  TOOLCHAIN_CACHE_TTL_MS,
  toolchainFileFormat,
} from "./file-toolchain.ts";
import { relativePathSchema } from "./primitives.ts";

const token = "ab".repeat(32);

const playgroundFile = {
  formatVersion: 1,
  id: "01JABCDEF0123456789ABCDEFG",
  template: { id: "react19", source: "builtin", appVersion: "1.0.0" },
  runner: "vite",
  requires: { node: ">=24" },
  toolchainAtCreate: { node: "24.1.0", pnpm: "11.0.0" },
  packageManager: "pnpm",
  entry: "src/App.tsx",
  open: ["src/App.tsx", "src/index.css"],
  note: "pricing table",
  createdAt: 1_760_000_000_000,
  createdBy: { kind: "agent", agent: "Claude Code", command: "new react19 pricing-table" },
  autoClean: { enabled: true, days: 7 },
  script: { autoRun: true },
  trust: "trusted",
};

const libraryFile = {
  formatVersion: 1,
  root: "/Users/someone/Runyard",
  playgrounds: [
    {
      id: "01JABCDEF0123456789ABCDEFG",
      path: "/Users/someone/Runyard/pricing-table",
      port: 7100,
      lastUsedAt: 1_760_000_100_000,
      lastOpenedAt: 1_760_000_050_000,
      clean: { remindedAt: 1_760_000_060_000, snoozedUntil: 1_760_900_000_000 },
    },
    {
      id: "01JZZZZZZZZZZZZZZZZZZZZZZZ",
      path: "/Users/someone/Runyard/gone",
      lastUsedAt: 1_760_000_000_000,
      missingSince: 1_760_000_300_000,
    },
  ],
};

const supervisorFile = {
  formatVersion: 2,
  pid: 4242,
  processStart: 1_760_000_000_000,
  startedAt: 1_760_000_000_000,
  endpoint: "/Users/someone/.runyard/run/supervisor.sock",
  token,
  protocol: 1,
  minClientProtocol: 1,
  version: "1.0.0",
  build: "1.0.0+k3j29xq",
  host: "electron",
  execPath: "/Applications/Runyard.app/Contents/MacOS/Runyard",
};

const runRecord = {
  formatVersion: 1,
  runId: "r_1",
  playgroundId: "01JABCDEF0123456789ABCDEFG",
  owner: { kind: "cli", agent: "Claude Code", command: "run pricing-table" },
  pid: 5151,
  processStart: 1_760_000_200_000,
  cwd: "/Users/someone/Runyard/pricing-table",
  port: 7100,
  command: ["pnpm", "dev", "--port", "7100"],
  startedAt: 1_760_000_200_100,
  state: "ready",
};

const toolchainFile = {
  formatVersion: 1,
  entries: {
    "zsh:12345": {
      checkedAt: 1_760_000_000_000,
      tools: [{ tool: "node", status: "found", path: "/usr/local/bin/node", version: "24.1.0" }],
    },
  },
};

const settingsFile = {
  formatVersion: 1,
  libraryRoot: "/Users/someone/Runyard",
  cliIdleStopMinutes: 30,
  ports: { min: 7100, max: 7999 },
};

type Case = {
  title: string;
  format: FileFormat;
  ok: Record<string, unknown>;
  // 每一项把一个合法文件弄坏的一种做法
  bad: Record<string, (file: Record<string, unknown>) => Record<string, unknown>>;
};

const del = (key: string) => (file: Record<string, unknown>) => {
  const { [key]: _gone, ...rest } = file;
  return rest;
};
const set = (key: string, value: unknown) => (file: Record<string, unknown>) => ({
  ...file,
  [key]: value,
});

const cases: Case[] = [
  {
    title: "playground.json",
    format: playgroundFileFormat,
    ok: playgroundFile,
    bad: {
      缺id: del("id"),
      缺createdBy: del("createdBy"),
      信任值不是trusted: set("trust", "untrusted"),
      入口用了反斜杠: set("entry", "src\\App.tsx"),
      入口是绝对路径: set("entry", "/etc/passwd"),
      打开的文件含上级目录: set("open", ["../secret"]),
      创建者种类未知: set("createdBy", { kind: "robot" }),
    },
  },
  {
    title: "library.json",
    format: libraryFileFormat,
    ok: libraryFile,
    bad: {
      缺root: del("root"),
      项目不是数组: set("playgrounds", {}),
      端口越界: set("playgrounds", [{ ...libraryFile.playgrounds[0], port: 70000 }]),
      项缺id: set("playgrounds", [{ path: "/x", lastUsedAt: 1 }]),
    },
  },
  {
    title: "settings.json",
    format: settingsFileFormat,
    ok: settingsFile,
    bad: {
      端口范围越界: set("ports", { min: 0, max: 7999 }),
      空闲分钟数是0: set("cliIdleStopMinutes", 0),
      包管理器未知: set("packageManager", "yarn"),
    },
  },
  {
    title: "cli.json",
    format: cliFileFormat,
    ok: { formatVersion: 1, lang: "zh-CN" },
    bad: { 语言不认识: set("lang", "fr") },
  },
  {
    title: "supervisor.json",
    format: supervisorFileFormat,
    ok: supervisorFile,
    bad: {
      口令太短: set("token", "ab"),
      口令含大写: set("token", "AB".repeat(32)),
      缺构建标识: del("build"),
      宿主未知: set("host", "browser"),
      进程号是0: set("pid", 0),
    },
  },
  {
    title: "runs/<runId>.json",
    format: runRecordFormat,
    ok: runRecord,
    bad: {
      缺启动时间: del("processStart"),
      命令为空: set("command", []),
      状态未知: set("state", "paused"),
      持有者种类未知: set("owner", { kind: "robot" }),
    },
  },
  {
    title: "toolchain.json",
    format: toolchainFileFormat,
    ok: toolchainFile,
    bad: {
      结论状态未知: set("entries", {
        k: { checkedAt: 1, tools: [{ tool: "node", status: "maybe" }] },
      }),
      缺检测时间: set("entries", { k: { tools: [] } }),
    },
  },
];

describe.each(cases)("$title", ({ format, ok, bad }) => {
  it("合法的文件读入后与原样一致，序列化再读回来不变（往返）", () => {
    const first = readVersioned(format, ok);
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    expect(first.value).toEqual(ok);
    expect(first.upgradedFrom).toBeUndefined();
    const text = serializeVersioned(format, first.value);
    expect(readVersioned(format, JSON.parse(text))).toEqual(first);
  });

  it.each(Object.keys(bad))("非法：%s 被当作损坏", (name) => {
    const broken = bad[name as keyof typeof bad]?.(ok);
    expect(readVersioned(format, broken)).toMatchObject({
      status: "corrupt",
      reason: "invalid",
      recovery: format.recovery,
    });
  });

  it("读到更新版本的文件：只读，不当作损坏", () => {
    const result = readVersioned(format, { ...ok, formatVersion: format.currentVersion + 1 });
    expect(result).toMatchObject({ status: "newer", readOnly: true });
  });
});

describe("未知字段", () => {
  const unknown = { futureField: { nested: [1, 2] } };

  it("playground.json 顶层的未知字段原样保留（文件随文件夹被拷走和提交）", () => {
    const result = readVersioned(playgroundFileFormat, { ...playgroundFile, ...unknown });
    expect(result.status === "ok" && result.value).toMatchObject(unknown);
  });

  it("library.json 顶层和每一项里的未知字段原样保留", () => {
    const result = readVersioned(libraryFileFormat, {
      ...libraryFile,
      ...unknown,
      playgrounds: [{ ...libraryFile.playgrounds[0], ...unknown }],
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.value).toMatchObject(unknown);
    expect(result.value.playgrounds[0]).toMatchObject(unknown);
  });

  it("settings.json 里还没定形状的字段（network，随 #189）和更新版本多写的字段原样往返", () => {
    const file = { ...settingsFile, network: { registry: "https://r.example" }, futureField: 1 };
    const result = readVersioned(settingsFileFormat, file);
    expect(result.status === "ok" && result.value).toEqual(file);
  });

  it("cli.json 的未知字段原样保留", () => {
    const result = readVersioned(cliFileFormat, { formatVersion: 1, ...unknown });
    expect(result.status === "ok" && result.value).toMatchObject(unknown);
  });

  it("supervisor.json、运行记录、缓存是整个重写的，未知字段读入时丢弃", () => {
    const dropped: [FileFormat, Record<string, unknown>][] = [
      [supervisorFileFormat, supervisorFile],
      [runRecordFormat, runRecord],
      [toolchainFileFormat, toolchainFile],
    ];
    for (const [format, file] of dropped) {
      const result = readVersioned(format, { ...file, ...unknown });
      expect(
        result.status === "ok" &&
          result.value !== null &&
          typeof result.value === "object" &&
          "futureField" in result.value,
      ).toBe(false);
    }
  });
});

describe("各文件的约定", () => {
  it("[LIBRARY-PLAYGROUNDS-02] playground.json 记录创建者：种类、智能体名、创建命令", () => {
    const result = readVersioned(playgroundFileFormat, playgroundFile);
    expect(result.status === "ok" && result.value.createdBy).toEqual({
      kind: "agent",
      agent: "Claude Code",
      command: "new react19 pricing-table",
    });
  });

  it("playground.json 不存名称，也不存端口和使用时间（它们在文件夹名和 library.json）", () => {
    const result = readVersioned(playgroundFileFormat, playgroundFile);
    if (result.status !== "ok") throw new Error("expected ok");
    for (const key of ["name", "port", "lastUsedAt", "path"])
      expect(key in result.value).toBe(false);
  });

  it("脚本项目的 library.json 项没有端口也合法（端口登记表就是各项的 port）", () => {
    const result = readVersioned(libraryFileFormat, libraryFile);
    expect(result.status === "ok" && result.value.playgrounds[1]?.port).toBeUndefined();
  });

  it("settings.json 的字段都可省略，缺的由 core 补默认值", () => {
    expect(readVersioned(settingsFileFormat, { formatVersion: 1 }).status).toBe("ok");
  });

  it("cli.json 没有 lang 就是英文", () => {
    const empty = readVersioned(cliFileFormat, { formatVersion: 1 });
    const zh = readVersioned(cliFileFormat, { formatVersion: 1, lang: "zh-CN" });
    expect(effectiveCliLocale(empty.status === "ok" ? empty.value : undefined)).toBe("en");
    expect(effectiveCliLocale(zh.status === "ok" ? zh.value : undefined)).toBe("zh-CN");
    expect(effectiveCliLocale(undefined)).toBe("en");
  });

  it("[SUPERVISOR-LIFECYCLE-11] 发现文件含进程号、连接点、口令、协议版本、产品版本、构建标识、宿主和可执行文件路径", () => {
    const result = readVersioned(supervisorFileFormat, supervisorFile);
    if (result.status !== "ok") throw new Error("expected ok");
    for (const key of [
      "pid",
      "endpoint",
      "token",
      "protocol",
      "minClientProtocol",
      "version",
      "build",
      "host",
      "execPath",
    ])
      expect(result.value).toHaveProperty(key);
  });

  it("上一版（v1）的发现文件没有启动时间：升到 v2 后照常读出，processStart 缺失", () => {
    const { processStart: _omit, ...rest } = supervisorFile;
    const result = readVersioned(supervisorFileFormat, { ...rest, formatVersion: 1 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.upgradedFrom).toBe(1);
    expect(result.value.formatVersion).toBe(2);
    expect(result.value.processStart).toBeUndefined();
  });

  it("doctor --bundle 打包前去掉口令，其余字段不变", () => {
    const result = readVersioned(supervisorFileFormat, supervisorFile);
    if (result.status !== "ok") throw new Error("expected ok");
    const redacted = redactSupervisorFile(result.value);
    expect("token" in redacted).toBe(false);
    expect(redacted.build).toBe(supervisorFile.build);
  });

  it("[SUPERVISOR-LIFECYCLE-16] 运行记录带进程号和启动时间，崩溃后核对身份用", () => {
    const result = readVersioned(runRecordFormat, runRecord);
    expect(result.status === "ok" && [result.value.pid, result.value.processStart]).toEqual([
      5151, 1_760_000_200_000,
    ]);
  });

  it("运行记录里脚本没有端口也合法", () => {
    expect(readVersioned(runRecordFormat, del("port")(runRecord)).status).toBe("ok");
  });

  it("每种文件坏了的处理方式：索引重扫，设置和命令行回默认，缓存和发现文件丢弃，其余跳过", () => {
    expect(libraryFileFormat.recovery).toBe("rescan");
    expect(settingsFileFormat.recovery).toBe("defaults");
    expect(cliFileFormat.recovery).toBe("defaults");
    expect(toolchainFileFormat.recovery).toBe("discard");
    expect(supervisorFileFormat.recovery).toBe("discard");
    expect(playgroundFileFormat.recovery).toBe("skip");
    expect(runRecordFormat.recovery).toBe("skip");
  });

  it("工具检测缓存 1 小时内有效，到点或时钟回拨都算过期", () => {
    const entry = { checkedAt: 1_000_000, tools: [] };
    expect(isToolchainCacheFresh(entry, entry.checkedAt + TOOLCHAIN_CACHE_TTL_MS - 1)).toBe(true);
    expect(isToolchainCacheFresh(entry, entry.checkedAt + TOOLCHAIN_CACHE_TTL_MS)).toBe(false);
    expect(isToolchainCacheFresh(entry, entry.checkedAt - 1)).toBe(false);
  });
});

describe("相对路径", () => {
  it.each(["a", "src/App.tsx", "a/b/c.txt", ".hidden/x", "a b/c"])("合法：%s", (path) => {
    expect(relativePathSchema.safeParse(path).success).toBe(true);
  });

  it.each([
    "",
    "src\\App.tsx",
    "/abs/path",
    "C:/x",
    "c:x",
    "../x",
    "a/../b",
    "./a",
    "a//b",
    "a/",
    "a\0b",
  ])("非法：%j", (path) => {
    expect(relativePathSchema.safeParse(path).success).toBe(false);
  });
});
