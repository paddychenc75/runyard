import type { WebContents } from "electron";

/** 一次手动刷新只在原生页面停止加载后完成，不把 IPC 已送达当成页面已刷新。 */
export class PreviewReload {
  readonly #contents: Pick<WebContents, "on" | "removeListener" | "reload">;
  #pending: Promise<void> | undefined;
  #finish: (() => void) | undefined;

  constructor(contents: Pick<WebContents, "on" | "removeListener" | "reload">) {
    this.#contents = contents;
  }

  start(): Promise<void> {
    if (this.#pending !== undefined) return this.#pending;
    let resolve = () => {};
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    this.#pending = promise;
    const contents = this.#contents;
    let started = false;
    const onStart = () => {
      started = true;
    };
    const onStop = () => {
      if (started) finish();
    };
    const onFail = (
      _event: unknown,
      _code: number,
      _description: string,
      _url: string,
      main: boolean,
    ) => {
      if (main) finish();
    };
    const finish = () => {
      contents.removeListener("did-start-loading", onStart);
      contents.removeListener("did-stop-loading", onStop);
      contents.removeListener("did-fail-load", onFail);
      contents.removeListener("destroyed", finish);
      contents.removeListener("render-process-gone", finish);
      this.#pending = undefined;
      this.#finish = undefined;
      resolve();
    };
    this.#finish = finish;
    contents.on("did-start-loading", onStart);
    contents.on("did-stop-loading", onStop);
    contents.on("did-fail-load", onFail);
    contents.on("destroyed", finish);
    contents.on("render-process-gone", finish);
    try {
      contents.reload();
    } catch {
      // 视图恰好被关闭时仍结束等待；错误画面由页面本身负责，不添加额外通知。
      finish();
    }
    return promise;
  }

  dispose(): void {
    this.#finish?.();
  }
}
