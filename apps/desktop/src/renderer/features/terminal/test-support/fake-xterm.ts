// xterm 在 jsdom 里画不出来：测试用这几个假类换掉 @xterm/*（只在 *.test.ts(x) 里导入）。
// 假终端记下所有调用，测试用 press / emitData 模拟按键和用户输入。

type Listener<T> = (value: T) => void;

export class FakeTerminal {
  static instances: FakeTerminal[] = [];
  static last(): FakeTerminal {
    const last = FakeTerminal.instances.at(-1);
    if (last === undefined) throw new Error("no terminal created");
    return last;
  }
  static reset(): void {
    FakeTerminal.instances = [];
  }

  options: Record<string, unknown>;
  cols = 80;
  rows = 24;
  buffer = { active: { cursorX: 0, cursorY: 0 } };
  writes: string[] = [];
  pastes: string[] = [];
  focused = 0;
  cleared = 0;
  resets = 0;
  selectedAll = 0;
  disposed = false;
  selection = "";
  keyHandler: ((event: KeyboardEvent) => boolean) | null = null;
  #data: Listener<string>[] = [];
  #resize: Listener<{ cols: number; rows: number }>[] = [];

  constructor(options: Record<string, unknown>) {
    this.options = { ...options };
    FakeTerminal.instances.push(this);
  }

  loadAddon(addon: { activate?: (terminal: FakeTerminal) => void }): void {
    addon.activate?.(this);
  }
  open(): void {}
  write(data: string, callback?: () => void): void {
    this.writes.push(data);
    callback?.();
  }
  paste(text: string): void {
    this.pastes.push(text);
  }
  focus(): void {
    this.focused++;
  }
  clear(): void {
    this.cleared++;
  }
  reset(): void {
    this.resets++;
    this.writes = [];
  }
  selectAll(): void {
    this.selectedAll++;
  }
  clearSelection(): void {
    this.selection = "";
  }
  hasSelection(): boolean {
    return this.selection !== "";
  }
  getSelection(): string {
    return this.selection;
  }
  dispose(): void {
    this.disposed = true;
  }
  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
    this.keyHandler = handler;
  }
  onData(listener: Listener<string>): { dispose(): void } {
    this.#data.push(listener);
    return { dispose: () => {} };
  }
  onResize(listener: Listener<{ cols: number; rows: number }>): { dispose(): void } {
    this.#resize.push(listener);
    return { dispose: () => {} };
  }

  /** 用户在终端里输入 */
  emitData(data: string): void {
    for (const listener of this.#data) listener(data);
  }
  /** 终端大小变了（拖面板、调窗口） */
  emitResize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    for (const listener of this.#resize) listener({ cols, rows });
  }
  /** 按键：返回 xterm 会不会继续处理（false = 不处理），并带回 preventDefault 有没有被调用 */
  press(
    key: string,
    modifiers: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {},
  ) {
    const event = new KeyboardEvent("keydown", { key, cancelable: true, ...modifiers });
    const handled = this.keyHandler?.(event) ?? true;
    return { xtermHandles: handled, defaultPrevented: event.defaultPrevented };
  }
}

export class FakeFitAddon {
  size: { cols: number; rows: number } | undefined = { cols: 100, rows: 30 };
  fit(): void {}
  proposeDimensions() {
    return this.size;
  }
}

export class FakeSearchAddon {
  static last: FakeSearchAddon | null = null;
  calls: { kind: string; term?: string; options?: Record<string, unknown> }[] = [];
  #results: Listener<{ resultIndex: number; resultCount: number }>[] = [];
  constructor() {
    FakeSearchAddon.last = this;
  }
  findNext(term: string, options: Record<string, unknown>): boolean {
    this.calls.push({ kind: "next", term, options });
    return true;
  }
  findPrevious(term: string, options: Record<string, unknown>): boolean {
    this.calls.push({ kind: "previous", term, options });
    return true;
  }
  clearDecorations(): void {
    this.calls.push({ kind: "clearDecorations" });
  }
  clearActiveDecoration(): void {
    this.calls.push({ kind: "clearActive" });
  }
  onDidChangeResults(listener: Listener<{ resultIndex: number; resultCount: number }>) {
    this.#results.push(listener);
    return { dispose: () => {} };
  }
  emitResults(resultIndex: number, resultCount: number): void {
    for (const listener of this.#results) listener({ resultIndex, resultCount });
  }
}

export class FakeWebLinksAddon {
  static last: FakeWebLinksAddon | null = null;
  readonly handler: (event: MouseEvent, uri: string) => void;
  constructor(handler: (event: MouseEvent, uri: string) => void) {
    this.handler = handler;
    FakeWebLinksAddon.last = this;
  }
}
