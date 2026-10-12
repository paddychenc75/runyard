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

// 登记表里的每个代码都要有中英文文案（临时断言，完整的 i18n-codes 检查是 issue #23）。
// 键和参数名的对错在编译期由 messages.ts 守着（t() 的调用写错就是类型错误）；
// 这里的运行时部分：文案是否真的存在、真实参数值下渲染出什么句子。
// 参数名是否和登记表一致见 build/code-texts-params.test.ts（要用 ICU 解析器，只能在 build/ 里）。

const fields: readonly ErrorMessageField[] = ["title", "body", "hint", "hintCli"];

const make = (locale: Locale) =>
  createTranslator({ locale, platform: "darwin", catalogs: cliCatalogs });
const merged = (locale: Locale) =>
  Object.assign({}, ...cliCatalogs.map((catalog) => catalog[locale])) as Record<string, string>;

// 每个错误码一组真实风格的参数；写成映射类型，登记表新增代码而这里漏写，tsc 直接报错
const errorExamples: { [C in ErrorCode]: ErrorParams<C> } = {
  INTERNAL: {},
  USAGE: {},
  NAME_INVALID: { name: "My App" },
  NAME_RESERVED: { name: "nul" },
  VAR_INVALID: { key: "title" },
  PLAYGROUND_NOT_FOUND: { name: "react19-9" },
  TEMPLATE_NOT_FOUND: { template: "react99" },
  FOLDER_MISSING: { name: "vue-drag-list" },
  RUN_NOT_FOUND: { runId: "r_8f3a" },
  TOOL_MISSING: { tool: "go", required: ">=1.22 <2" },
  TOOL_TOO_OLD: { tool: "node", required: ">=22.18", found: "20.11.0" },
  RUNTIME_MISSING: { tool: "python" },
  SETUP_FAILED: { name: "react19-3" },
  DEPS_OFFLINE: { name: "react19-3" },
  RUN_FAILED: { name: "next16-1" },
  SCRIPT_ERRORED: { name: "python-2" },
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
  PROCESS_EXITED: [{ exitCode: 1 }, { signal: "SIGKILL" }, {}],
  DEPS_FROM_CACHE: [{}],
  PORT_FALLBACK: [
    { wanted: 7111, actual: 7112, reason: "PORT_OCCUPIED" },
    { wanted: 7111, actual: 7112, reason: "PORT_RESERVED" },
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

describe("每个登记的代码在两种语言里都有文案", () => {
  for (const locale of locales) {
    const catalog = merged(locale);

    it(`[${locale}] 错误码：四个字段齐全，没有多余的 errors 键`, () => {
      const expected = errorCodes.flatMap((code) => fields.map((f) => `errors.${code}.${f}`));
      const actual = Object.keys(catalog).filter((key) => key.startsWith("errors."));
      expect(actual.sort()).toEqual(expected.sort());
    });

    it(`[${locale}] 提示码和运行状态：每个都有，没有多余的键`, () => {
      const notices = Object.keys(catalog).filter((key) => key.startsWith("notice."));
      expect(notices.sort()).toEqual(noticeCodes.map((code) => `notice.${code}`).sort());
      const states = Object.keys(catalog).filter((key) => key.startsWith("runState."));
      expect(states.sort()).toEqual(runStates.map((state) => `runState.${state}`).sort());
    });

    it(`[${locale}] 没有空文案，也没有首尾空白`, () => {
      for (const [key, message] of Object.entries(catalog)) {
        expect(message.trim(), key).not.toBe("");
        expect(message, key).toBe(message.trim());
      }
    });
  }

  it("示例覆盖全部错误码和提示码", () => {
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

  it("所有渲染结果里没有残留的占位符", () => {
    for (const locale of locales)
      for (const line of render(locale)) expect(line).not.toMatch(/[{}]/);
  });
});
