import type { Localized, Translate } from "@runyard/i18n";
import type { Notice } from "@runyard/protocol";
import { type CliError, exitCodeOf } from "../cli-error.ts";
import { englishErrorFields, humanErrorLines } from "./error-text.ts";

// 命令行唯一的输出口（技术设计 §5.3；ui-strings 检查：只有本目录可以写标准输出）。
// 给人看的文字只收 Localized，用户的数据（日志正文、名称）走 data()，所以“没翻译的句子”过不了类型检查。
// 带 --json 时标准输出上恰好一个对象（result 或 error），logs --follow 例外用 stream() 每行一个对象。

export interface TextSink {
  write(chunk: string): unknown;
}

/** 能放进 JSON 输出的对象；路径要绝对、地址写 127.0.0.1 是命令的责任 */
export type JsonObject = { readonly [key: string]: unknown };

export interface OutputOptions {
  stdout: TextSink;
  stderr: TextSink;
  json: boolean;
  quiet: boolean;
  /** 当前语言的翻译函数，给人看的文字用 */
  t: Translate;
  /** 英文翻译函数，--json 里的 message 和 hint 永远用它 */
  tEnglish: Translate;
}

export class Output {
  readonly #o: OutputOptions;
  readonly #notices: Notice[] = [];
  #resultWritten = false;
  #streamed = false;

  constructor(options: OutputOptions) {
    this.#o = options;
  }

  get json(): boolean {
    return this.#o.json;
  }

  /** 有没有已经把结果写出去（单个对象，或 NDJSON 的至少一行） */
  get emitted(): boolean {
    return this.#resultWritten || this.#streamed;
  }

  /** 给人看的一行，写到标准输出。带 --json 时什么也不写 */
  line(text: Localized): void {
    if (!this.#o.json) this.#o.stdout.write(`${text}\n`);
  }

  /** 用户的数据（日志正文、名称）原样写到标准输出，不加换行。带 --json 时什么也不写 */
  data(text: string): void {
    if (!this.#o.json) this.#o.stdout.write(text);
  }

  /**
   * --help 的正文：由 help/ 用 Localized 的说明文字加不翻译的命令名、参数名拼成。
   * 帮助是给人看的，--json 下也照常写到标准输出
   */
  help(text: string): void {
    this.#o.stdout.write(text);
  }

  /** 进度行：标准错误；--quiet 和 --json 下不写 */
  progress(text: Localized): void {
    if (!this.#o.json && !this.#o.quiet) this.#o.stderr.write(`${text}\n`);
  }

  /** 管理进程给的提示：--json 时收进结果的 notices，否则写到标准错误（--quiet 下不写） */
  notice(notice: Notice): void {
    if (this.#o.json) {
      this.#notices.push(notice);
      return;
    }
    if (this.#o.quiet) return;
    // 键由提示码推出（notice.<码>），参数类型随码变，这里按联合类型一次转换
    const t = this.#o.t as (key: string, values: unknown) => Localized;
    this.#o.stderr.write(`${t(`notice.${notice.code}`, notice.params)}\n`);
  }

  /**
   * 命令的结果。--json：写成一个对象（有提示时带 notices）；否则把 human 里的行写到标准输出。
   * 一次命令只能调一次。
   */
  result(json: JsonObject, human: readonly Localized[] = []): void {
    if (this.emitted) throw new Error("result() was already written for this command");
    this.#resultWritten = true;
    if (this.#o.json) {
      const withNotices = this.#notices.length > 0 ? { ...json, notices: this.#notices } : json;
      this.#o.stdout.write(`${JSON.stringify(withNotices)}\n`);
      return;
    }
    for (const text of human) this.line(text);
  }

  /** NDJSON 的一行（只给 logs --follow --json）。不带 --json 时什么也不写 */
  stream(json: JsonObject): void {
    if (this.#resultWritten) throw new Error("stream() cannot follow result()");
    this.#streamed = true;
    if (this.#o.json) this.#o.stdout.write(`${JSON.stringify(json)}\n`);
  }

  /** 失败。--json：一个 {"error": …} 对象写到标准输出；否则写到标准错误。返回退出码 */
  error(error: CliError): number {
    const asObject = this.#o.json && !this.#resultWritten;
    if (asObject) {
      const fields = englishErrorFields(this.#o.tEnglish, error);
      const body = { code: error.code, ...fields, data: error.params, ...causeField(error) };
      this.#o.stdout.write(`${JSON.stringify({ error: body })}\n`);
    } else {
      for (const text of humanErrorLines(this.#o.t, error)) this.#o.stderr.write(`${text}\n`);
    }
    return exitCodeOf(error.code);
  }

  /** 写一行到标准错误，不受 --quiet 和 --json 影响：不认识的语言值这类必须让人看到的提示 */
  stderrLine(text: Localized): void {
    this.#o.stderr.write(`${text}\n`);
  }
}

function causeField(error: CliError): { cause?: unknown } {
  return error.errorCause === undefined ? {} : { cause: error.errorCause };
}
