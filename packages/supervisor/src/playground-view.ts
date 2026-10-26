import type { LibraryItem, PlaygroundFileRead } from "@runyard/core";
import type { Playground, PlaygroundFile, PlaygroundSize, RunKind } from "@runyard/protocol";

// 协议里的 Playground = 项目文件夹里的 playground.json 加索引里的本机字段。
// 文件读不出来（文件夹找不到、更新版本写的、坏了）时用最近一次读到的内容；从没读到过的，
// 只能给占位值：索引不存模板和运行器，协议却要求这些字段（报告给协调人）。

export function placeholderFile(item: LibraryItem): PlaygroundFile {
  return {
    formatVersion: 1,
    id: item.entry.id,
    template: { id: "unknown", source: "user", appVersion: "0.0.0" },
    runner: "unknown",
    requires: {},
    toolchainAtCreate: {},
    createdAt: item.entry.lastUsedAt,
    createdBy: { kind: "user" },
    autoClean: { enabled: false },
    trust: "trusted",
  };
}

export function fileFrom(
  read: PlaygroundFileRead,
  cached: PlaygroundFile | undefined,
  item: LibraryItem,
): PlaygroundFile {
  return read.status === "ok" ? read.value : (cached ?? placeholderFile(item));
}

export function toPlayground(
  item: LibraryItem,
  file: PlaygroundFile,
  runnerKind: RunKind | undefined,
  size?: PlaygroundSize,
): Playground {
  const { entry } = item;
  // 运行器查不到时的猜测：有端口的是服务，没有的是脚本（static 与 server 在这里分不出）
  const kind: RunKind = runnerKind ?? (entry.port === undefined ? "oneshot" : "server");
  return {
    id: entry.id,
    name: item.name,
    path: entry.path,
    kind,
    template: file.template,
    runner: file.runner,
    ...(file.packageManager !== undefined ? { packageManager: file.packageManager } : {}),
    ...(file.entry !== undefined ? { entry: file.entry } : {}),
    ...(file.note !== undefined ? { note: file.note } : {}),
    createdAt: file.createdAt,
    createdBy: file.createdBy,
    autoClean: file.autoClean,
    ...(file.script?.autoRun !== undefined ? { scriptAutoRun: file.script.autoRun } : {}),
    ...(file.requestAutoResend !== undefined ? { requestAutoResend: file.requestAutoResend } : {}),
    ...(entry.port !== undefined ? { port: entry.port } : {}),
    lastUsedAt: entry.lastUsedAt,
    ...(entry.lastOpenedAt !== undefined ? { lastOpenedAt: entry.lastOpenedAt } : {}),
    ...(entry.missingSince !== undefined ? { missingSince: entry.missingSince } : {}),
    ...(size !== undefined && entry.missingSince === undefined ? { size } : {}),
  };
}
