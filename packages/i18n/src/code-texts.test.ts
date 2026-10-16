import {
  type ErrorCode,
  type ErrorParams,
  errorCodes,
  type NoticeCode,
  type NoticeParams,
  noticeCodes,
  runStates,
} from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { cliCatalogs } from "./cli-catalogs.ts";
import { createTranslator } from "./create-translator.ts";
import { type Locale, locales } from "./locale.ts";
import type { ErrorMessageField } from "./messages.ts";

// 真实参数值下渲染出什么句子（语法、空格、标点、复数、可选参数）。
// “每个代码都有中英文文案、参数和登记表一致”不在这里测：那是 i18n-codes 检查（pnpm check），
// 实现在 build/code-texts-check.ts，包内由 build/code-texts-check.test.ts 对真实文案跑同一份。

const fields: readonly ErrorMessageField[] = ["title", "body", "hint", "hintCli"];

const make = (locale: Locale) =>
  createTranslator({ locale, platform: "darwin", catalogs: cliCatalogs });

// 每个错误码一组真实风格的参数；写成映射类型，登记表新增代码而这里漏写，tsc 直接报错
const errorExamples: { [C in ErrorCode]: ErrorParams<C> } = {
  INTERNAL: {},
  USAGE: {},
  NAME_INVALID: { name: "My App" },
  NAME_RESERVED: { name: "nul" },
  VAR_INVALID: { key: "title" },
  PLAYGROUND_NOT_FOUND: { name: "react19-9" },
  TEMPLATE_NOT_FOUND: { template: "react99" },
  TEMPLATE_INVALID: { template: "hello" },
  FOLDER_MISSING: { name: "vue-drag-list" },
  RUN_NOT_FOUND: { runId: "r_8f3a" },
  TOOL_MISSING: { tool: "go", required: ">=1.22 <2" },
  TOOL_TOO_OLD: { tool: "node", required: ">=22.18", found: "20.11.0" },
  RUNTIME_MISSING: { tool: "python" },
  SETUP_FAILED: { name: "react19-3" },
  DEPS_OFFLINE: { name: "react19-3" },
  RUN_FAILED: { name: "next16-1" },
  SCRIPT_ERRORED: { name: "python-2" },
  TEMPLATE_TEST_FAILED: { template: "react19", step: "reload" },
  READY_TIMEOUT: { name: "next16-1", seconds: 60 },
  NAME_EXISTS: { name: "pricing-table" },
  BUSY: { name: "react19-3" },
  PATH_LOCKED: { name: "react19-3" },
  PATH_TOO_LONG: { name: "react19-3" },
  TRASH_UNAVAILABLE: { name: "react19-3" },
  APP_REQUIRED: {},
  SUPERVISOR_UNAVAILABLE: {},
  SUPERVISOR_OUTDATED: { runs: 3 },
  CLIENT_OUTDATED: {},
  NOT_SUPPORTED: {},
  DATA_FROM_NEWER_VERSION: { file: "settings.json", found: 3, supported: 2 },
};

// 提示码可以有几组参数：覆盖每个分支（复数的 1 和多个、select 的每个取值、可选参数有无）
const noticeExamples: { [C in NoticeCode]: NoticeParams<C>[] } = {
  RELOADING: [{}],
  STOPPED_BY_USER: [{}],
  PROCESS_EXITED: [
    { exitCode: 1 },
    { exitCode: 0 },
    { signal: "SIGKILL" },
    { exitCode: 137, signal: "SIGKILL" },
    {},
  ],
  DEPS_FROM_CACHE: [{}],
  PORT_FALLBACK: [
    { wanted: 7111, actual: 7112, reason: "PORT_OCCUPIED" },
    { wanted: 7111, actual: 7112, reason: "PORT_RESERVED" },
  ],
  PORT_NOT_RELEASED: [
    { port: 7111, waitedMs: 3000, limitMs: 3000 },
    { port: 7111, waitedMs: 1, limitMs: 1 },
  ],
  ENV_UNRESOLVED: [{ reason: "timeout" }, { reason: "failed" }],
  ENV_DEGRADED: [{}],
  IDLE_STOPPED: [{ minutes: 1 }, { minutes: 30 }],
  PACKAGE_MANAGER_FALLBACK: [{ wanted: "pnpm", used: "npm" }],
  PATH_NEAR_LIMIT: [
    { length: 1, limit: 1024 },
    { length: 1010, limit: 1024 },
  ],
  TOOL_VERSION_UNTESTED: [{ tool: "node", found: "28.0.0", required: ">=22.18 <26" }],
};

type Anything = (key: string, values?: object) => string;

describe("示例覆盖登记表", () => {
  it("示例覆盖全部错误码和提示码（登记表新增代码而这里漏写，tsc 也会报）", () => {
    expect(Object.keys(errorExamples).sort()).toEqual([...errorCodes].sort());
    expect(Object.keys(noticeExamples).sort()).toEqual([...noticeCodes].sort());
  });
});

describe("用真实参数渲染（读一遍句子：语法、空格、标点）", () => {
  const render = (locale: Locale): string[] => {
    const t = make(locale).t as unknown as Anything;
    const lines: string[] = [];
    for (const code of errorCodes) {
      for (const field of fields) {
        lines.push(`errors.${code}.${field}: ${t(`errors.${code}.${field}`, errorExamples[code])}`);
      }
    }
    for (const code of noticeCodes) {
      for (const params of noticeExamples[code]) {
        lines.push(
          `notice.${code} (${Object.entries(params)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}): ${t(`notice.${code}`, params)}`,
        );
      }
    }
    for (const state of runStates) lines.push(`runState.${state}: ${t(`runState.${state}`)}`);
    return lines;
  };

  it("中文", async () => {
    await expect(`${render("zh-CN").join("\n")}\n`).toMatchFileSnapshot(
      "__snapshots__/code-texts.zh-CN.txt",
    );
  });

  it("英文", async () => {
    await expect(`${render("en").join("\n")}\n`).toMatchFileSnapshot(
      "__snapshots__/code-texts.en.txt",
    );
  });

  it("[en] 复数：1 用单数，其他用复数", () => {
    const t = make("en").t;
    expect(t("notice.IDLE_STOPPED", { minutes: 1 })).toBe(
      "Stopped automatically after being idle for 1 minute.",
    );
    expect(t("notice.IDLE_STOPPED", { minutes: 30 })).toBe(
      "Stopped automatically after being idle for 30 minutes.",
    );
    expect(t("errors.SUPERVISOR_OUTDATED.body", { runs: 1 })).toContain("stop 1 run.");
    expect(t("errors.SUPERVISOR_OUTDATED.body", { runs: 3 })).toContain("stop 3 runs.");
    expect(t("errors.READY_TIMEOUT.title", { name: "app", seconds: 1 })).toBe(
      "Playground app was not ready after 1 second",
    );
  });

  it("[zh-CN] 中文没有复数形式", () => {
    expect(make("zh-CN").t("notice.IDLE_STOPPED", { minutes: 1 })).toBe(
      "空闲 1 分钟，已自动停止。",
    );
  });

  it("端口号不加千分位", () => {
    const text = make("en").t("notice.PORT_FALLBACK", {
      wanted: 7111,
      actual: 7112,
      reason: "PORT_OCCUPIED",
    });
    expect(text).toContain("Port 7111");
    expect(text).toContain("port 7112");
    expect(text).not.toContain("7,11");
  });

  it("废纸篓和访达走 platform 机制，调用的人不传", () => {
    expect(make("zh-CN").t("errors.TRASH_UNAVAILABLE.title", { name: "react19-3" })).toBe(
      "无法把项目 react19-3 移到废纸篓",
    );
    expect(make("en").t("errors.TRASH_UNAVAILABLE.title", { name: "react19-3" })).toBe(
      "Could not move playground react19-3 to the Trash",
    );
    expect(make("zh-CN").t("errors.FOLDER_MISSING.hint", { name: "x" })).toContain("在访达中");
    expect(make("en").t("errors.FOLDER_MISSING.hint", { name: "x" })).toContain("in Finder");
  });

  it("名称类错误按对象种类写：模板读“标识”，缺省仍是项目名称", () => {
    const zh = make("zh-CN").t;
    const en = make("en").t;
    const template = { name: "My_Template", kind: "template" } as const;
    expect(zh("errors.NAME_INVALID.title", template)).toBe("模板标识「My_Template」不合法");
    expect(zh("errors.NAME_INVALID.body", template)).toContain("标识只能包含");
    expect(en("errors.NAME_INVALID.title", template)).toBe('Invalid template ID "My_Template"');
    expect(en("errors.NAME_INVALID.hintCli", template)).toContain("with an ID");
    expect(zh("errors.NAME_EXISTS.title", { name: "react19", kind: "template" })).toBe(
      "模板标识 react19 已被占用",
    );
    expect(en("errors.NAME_EXISTS.hintCli", { name: "react19", kind: "template" })).toBe(
      "Run the command again with a different ID.",
    );
    expect(zh("errors.NAME_INVALID.title", { name: "My App" })).toBe("项目名称「My App」不合法");
    expect(en("errors.NAME_EXISTS.title", { name: "demo", kind: "playground" })).toBe(
      "A playground named demo already exists",
    );
  });

  it("所有渲染结果里没有残留的占位符", () => {
    for (const locale of locales)
      for (const line of render(locale)) expect(line).not.toMatch(/[{}]/);
  });
});
