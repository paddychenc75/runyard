import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import {
  SCROLLBACK_LINES,
  type TerminalSnapshot,
  type TerminalState,
} from "../../../shared/terminal.ts";
import { routeKey, type TerminalCommand } from "./terminal-keys.ts";
import {
  findDecorations,
  TERMINAL_FONT_FAMILY,
  TERMINAL_FONT_SIZE,
  TERMINAL_LINE_HEIGHT,
  type TerminalAppearance,
  terminalTheme,
} from "./terminal-theme.ts";

// 一个项目的终端在界面里的一次显示（规格 desktop/terminal）：把 xterm 接到主进程的 terminal.* 桥上。
// 显示期间输出经 terminal.data 推来、处理完用 terminal.ack 回执（流控靠它，不回执 shell 会被暂停）；
// 不显示（切到“输出”、切到别的标签页）时调 dispose：只是断开，终端和里面的命令不受影响。

export interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface FindResults {
  /** 当前是第几个，从 0 开始；没有当前结果是 -1 */
  index: number;
  count: number;
}

export interface TerminalSessionCallbacks {
  /** 终端状态变了（含第一次接上时的现状） */
  state(state: TerminalState): void;
  /** 查找结果变了 */
  findResults(results: FindResults): void;
  /** 右键：菜单该出现的位置（窗口坐标） */
  contextMenu(at: { x: number; y: number }): void;
  /** 焦点在终端里按了 ⌘F */
  findRequested(): void;
  /** 光标所在的行（从 0 开始，相对可见区域）：“终端已结束”那一行跟在它后面 */
  cursorRow(row: number): void;
}

export interface TerminalSessionOptions {
  bridge: DesktopBridge;
  project: string;
  /** xterm 画在这个元素里 */
  host: HTMLElement;
  appearance: TerminalAppearance;
  callbacks: TerminalSessionCallbacks;
  /** 首行说明（登录 shell 起不来时改用 zsh）的文字，由界面经文案包生成 */
  noticeText: (state: TerminalState) => string | null;
}

const FALLBACK_SIZE = { cols: 80, rows: 24 };

export class TerminalSession {
  readonly #bridge: DesktopBridge;
  readonly #project: string;
  readonly #host: HTMLElement;
  readonly #callbacks: TerminalSessionCallbacks;
  readonly #noticeText: TerminalSessionOptions["noticeText"];
  readonly #term: Terminal;
  readonly #fit = new FitAddon();
  readonly #search = new SearchAddon();
  readonly #stops: (() => void)[] = [];
  #appearance: TerminalAppearance;
  #state: TerminalState = { kind: "none" };
  #disposed = false;
  #reopening = false;
  /** 第一次拿到快照之前，推来的输出和状态先存着，快照写完再接上 */
  #ready = false;
  #queued: string[] = [];
  #queuedState: TerminalState | null = null;
  #query: { text: string; options: FindOptions } | null = null;
  #lastSize = FALLBACK_SIZE;

  constructor(options: TerminalSessionOptions) {
    this.#bridge = options.bridge;
    this.#project = options.project;
    this.#host = options.host;
    this.#callbacks = options.callbacks;
    this.#noticeText = options.noticeText;
    this.#appearance = options.appearance;
    this.#term = new Terminal({
      allowProposedApi: true,
      scrollback: SCROLLBACK_LINES,
      scrollOnUserInput: true,
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: TERMINAL_FONT_SIZE,
      lineHeight: TERMINAL_LINE_HEIGHT,
      cursorStyle: "block",
      cursorBlink: false,
      // 设计稿的光标不管焦点在不在终端里都是实心方块
      cursorInactiveStyle: "block",
      macOptionIsMeta: false,
      // 右键只弹菜单，不改选区：菜单里的“复制”要复制刚选中的文字（设计稿 TerminalMenu）
      rightClickSelectsWord: false,
      theme: terminalTheme(options.appearance),
    });
    this.#term.loadAddon(this.#fit);
    this.#term.loadAddon(this.#search);
    // ⌘ 加点击才打开网址，普通点击只做选择（规格 DESKTOP-TERMINAL-19）
    this.#term.loadAddon(
      new WebLinksAddon((event, uri) => {
        if (event.metaKey) void this.#bridge.call("link.openWeb", uri);
      }),
    );
    this.#term.attachCustomKeyEventHandler((event) => this.#onKey(event));
    this.#term.onData((data) => this.#onInput(data));
    this.#term.onResize(({ cols, rows }) => this.#onResize(cols, rows));
    const results = this.#search.onDidChangeResults(({ resultIndex, resultCount }) =>
      this.#callbacks.findResults({ index: resultIndex, count: resultCount }),
    );
    this.#stops.push(() => results.dispose());
  }

  /** 画出来并接上终端：第一次点“终端”时会创建，之后接上已有的 */
  async start(): Promise<void> {
    this.#term.open(this.#host);
    this.#watchHost();
    this.#stops.push(
      this.#bridge.on("terminal.data", (event) => {
        if (event.project !== this.#project) return;
        if (this.#ready) this.#writeOutput(event.data);
        else this.#queued.push(event.data);
      }),
      this.#bridge.on("terminal.state", (event) => {
        if (event.project !== this.#project) return;
        if (this.#ready) this.#setState(event.state);
        else this.#queuedState = event.state;
      }),
    );
    const size = this.#measure();
    this.#lastSize = size;
    const snapshot = await this.#bridge.call("terminal.open", { project: this.#project, ...size });
    if (this.#disposed) return;
    this.#showSnapshot(snapshot);
  }

  /** 终端已结束后“重新打开终端”：在项目文件夹里开新的，旧内容不留（规格 DESKTOP-TERMINAL-25） */
  async reopen(): Promise<void> {
    if (this.#reopening) return;
    this.#reopening = true;
    this.#ready = false;
    const size = this.#measure();
    this.#lastSize = size;
    const snapshot = await this.#bridge.call("terminal.reopen", {
      project: this.#project,
      ...size,
    });
    if (this.#disposed) return;
    this.#term.reset();
    this.#showSnapshot(snapshot);
    this.#reopening = false;
    this.#term.focus();
  }

  focus(): void {
    this.#term.focus();
  }

  /** 焦点是否在终端里（⌃` 要判断是进还是出） */
  hasFocus(): boolean {
    return this.#host.contains(document.activeElement);
  }

  hasSelection(): boolean {
    return this.#term.hasSelection();
  }

  setAppearance(appearance: TerminalAppearance): void {
    this.#appearance = appearance;
    // 只换配色：内容和 shell 都不动（规格 DESKTOP-TERMINAL-12）
    this.#term.options.theme = terminalTheme(appearance);
    this.#refreshFind();
  }

  async run(command: TerminalCommand): Promise<void> {
    switch (command) {
      case "copy": {
        const selected = this.#term.getSelection();
        // 没有选中时什么都不做，尤其不发中断（规格 DESKTOP-TERMINAL-15）
        if (selected !== "") await this.#bridge.call("clipboard.copy", selected);
        return;
      }
      case "paste": {
        const text = await this.#bridge.call("clipboard.read");
        // paste 会在 shell 打开了“括号粘贴”时包上标记，多行文字不会逐行执行（规格 DESKTOP-TERMINAL-16）
        if (text !== "" && this.#state.kind === "running") this.#term.paste(text);
        return;
      }
      case "selectAll":
        this.#term.selectAll();
        return;
      case "clear":
        this.#term.clear();
        await this.#bridge.call("terminal.clear", { project: this.#project });
        return;
      case "find":
        this.#callbacks.findRequested();
        return;
      case "findNext":
        this.findStep("next");
        return;
      case "findPrevious":
        this.findStep("previous");
        return;
    }
  }

  /** 查找栏里输入、切换选项：按新的条件从头找（规格 DESKTOP-TERMINAL-23） */
  setQuery(text: string, options: FindOptions): void {
    this.#query = { text, options };
    if (text === "") {
      this.clearFind();
      this.#callbacks.findResults({ index: -1, count: 0 });
      return;
    }
    this.#search.findNext(text, this.#searchOptions(options, true));
    this.#showMatchOnly();
  }

  findStep(direction: "next" | "previous"): void {
    const query = this.#query;
    if (query === null || query.text === "") return;
    const options = this.#searchOptions(query.options, false);
    if (direction === "next") this.#search.findNext(query.text, options);
    else this.#search.findPrevious(query.text, options);
    this.#showMatchOnly();
  }

  /** 查找会顺手选中当前结果，选区的颜色盖住了“当前结果”的高亮；这里取消选区，高亮就是设计稿里的样子 */
  #showMatchOnly(): void {
    this.#term.clearSelection();
  }

  clearFind(): void {
    this.#search.clearDecorations();
    this.#search.clearActiveDecoration();
    this.#term.clearSelection();
  }

  /** 关闭查找栏：高亮消失，查找条件也忘掉 */
  endFind(): void {
    this.#query = null;
    this.clearFind();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const stop of this.#stops) stop();
    // 只是不再显示：终端和里面的命令继续，输出照常记录（规格 DESKTOP-TERMINAL-04）
    void this.#bridge.call("terminal.detach", { project: this.#project }).catch(() => {});
    this.#term.dispose();
  }

  #searchOptions(options: FindOptions, incremental: boolean) {
    return {
      ...options,
      incremental,
      decorations: findDecorations(this.#appearance),
    };
  }

  #refreshFind(): void {
    const query = this.#query;
    if (query !== null && query.text !== "") this.setQuery(query.text, query.options);
  }

  #onKey(event: KeyboardEvent): boolean {
    const routed = routeKey(event, this.#bridge.bootstrap.modKey);
    if (routed.route === "shell") return true;
    if (routed.route === "terminal" && event.type === "keydown") {
      event.preventDefault();
      void this.run(routed.command);
    }
    // 应用级快捷键和终端自己处理的键，都不让 xterm 再往 shell 发
    return false;
  }

  #onInput(data: string): void {
    if (this.#state.kind === "ended") {
      // 结束后在终端里按回车也能重新打开（规格“终端结束后重新打开”）
      if (data === "\r") void this.reopen();
      return;
    }
    void this.#bridge.call("terminal.write", { project: this.#project, data });
  }

  #onResize(cols: number, rows: number): void {
    if (cols === this.#lastSize.cols && rows === this.#lastSize.rows) return;
    this.#lastSize = { cols, rows };
    void this.#bridge.call("terminal.resize", { project: this.#project, cols, rows });
    this.#reportCursor();
  }

  #measure(): { cols: number; rows: number } {
    this.#fit.fit();
    const proposed = this.#fit.proposeDimensions();
    return proposed === undefined ? FALLBACK_SIZE : { cols: proposed.cols, rows: proposed.rows };
  }

  #watchHost(): void {
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => {
        if (this.#host.clientWidth > 0 && this.#host.clientHeight > 0) this.#fit.fit();
      });
      observer.observe(this.#host);
      this.#stops.push(() => observer.disconnect());
    }
    // 按住 ⌘ 时网址才显示下划线和手形指针（规格 DESKTOP-TERMINAL-19，样式在 TerminalView.module.css）
    const mark = (event: KeyboardEvent) => {
      this.#host.toggleAttribute("data-mod-held", event.metaKey);
    };
    const release = () => this.#host.removeAttribute("data-mod-held");
    window.addEventListener("keydown", mark);
    window.addEventListener("keyup", mark);
    window.addEventListener("blur", release);
    this.#stops.push(() => {
      window.removeEventListener("keydown", mark);
      window.removeEventListener("keyup", mark);
      window.removeEventListener("blur", release);
    });
    this.#host.addEventListener("contextmenu", this.#onContextMenu);
    this.#stops.push(() => this.#host.removeEventListener("contextmenu", this.#onContextMenu));
  }

  readonly #onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    this.#callbacks.contextMenu({ x: event.clientX, y: event.clientY });
  };

  #showSnapshot(snapshot: TerminalSnapshot): void {
    const notice = this.#noticeText(snapshot.state);
    if (notice !== null) this.#term.write(`${notice}\r\n`);
    // 回放：之前记下的全部输出；回放不是推来的，不用回执
    if (snapshot.output !== "") this.#term.write(snapshot.output);
    this.#ready = true;
    this.#setState(snapshot.state);
    for (const data of this.#queued.splice(0)) this.#writeOutput(data);
    const queuedState = this.#queuedState;
    this.#queuedState = null;
    if (queuedState !== null) this.#setState(queuedState);
  }

  #writeOutput(data: string): void {
    // 写完（解析并交给渲染）才回执：慢了就让主进程暂停 shell，不堆在界面里
    this.#term.write(data, () => {
      void this.#bridge
        .call("terminal.ack", { project: this.#project, length: data.length })
        .catch(() => {});
    });
  }

  #setState(state: TerminalState): void {
    this.#state = state;
    // 结束后不再有光标（“终端已结束”那一行在它的位置上）；重新打开时 reset 会把它恢复
    if (state.kind === "ended") this.#term.write("\x1b[?25l");
    this.#callbacks.state(state);
    if (state.kind === "ended") this.#reportCursor();
  }

  #reportCursor(): void {
    if (this.#state.kind !== "ended") return;
    // 排在已有的输出之后：写空串的回调到了，光标就是最后的位置
    this.#term.write("", () => {
      const cursor = this.#term.buffer.active;
      this.#callbacks.cursorRow(cursor.cursorX > 0 ? cursor.cursorY + 1 : cursor.cursorY);
    });
  }
}
