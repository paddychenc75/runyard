import type { RunyardClient } from "@runyard/client";
import type { CliLocaleResolution, Format, Locale, Translate } from "@runyard/i18n";
import type { Env, Platform } from "@runyard/platform";
import type { CliHost } from "../cli-deps.ts";
import type { Output } from "../output/output.ts";
import type { CliSettings } from "../settings/cli-settings.ts";
import type { GlobalFlags } from "./global-options.ts";

/** 命令的实现拿到的全部东西。命令不碰 process，也不自己写标准输出 */
export interface CommandContext {
  /** 命令词之后的位置参数，个数已按声明校验过 */
  readonly positionals: readonly string[];
  readonly global: GlobalFlags;
  /** boolean 选项有没有给 */
  flag(name: string): boolean;
  /** string 选项最后一次给的值 */
  value(name: string): string | undefined;
  /** 可重复的 string 选项（如 --var）所有给过的值 */
  values(name: string): string[];

  readonly t: Translate;
  readonly format: Format;
  readonly locale: Locale;
  /** 生效的语言和来源（flag、env、saved、default） */
  readonly language: CliLocaleResolution;
  readonly out: Output;

  readonly platform: Platform;
  /** 本次调用的环境变量（注入的，不是 process.env） */
  readonly env: Env;
  readonly settings: CliSettings;
  readonly host: CliHost;
  /** 第一次调用时才连管理进程（连不上就拉起）；之后复用；命令结束时由入口关闭 */
  client(): Promise<RunyardClient>;
}
