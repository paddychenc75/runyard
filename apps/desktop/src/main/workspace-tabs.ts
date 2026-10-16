// 工作区的标签页（规格 desktop/workspace「打开标签页即运行」）：资源库固定第一位、不能关闭，
// 它不在这张表里；这里只记打开的项目标签页，顺序是打开的先后，每个项目最多一个。
// 纯数据，不认识 Electron 和管理进程。关闭标签页（#174，带确认）将在这里加 close。

export const LIBRARY_TAB = "library";

export class WorkspaceTabs {
  #open: string[] = [];
  #active: string = LIBRARY_TAB;

  get tabs(): readonly string[] {
    return this.#open;
  }

  /** 当前标签：资源库是 "library"，项目标签是项目 id */
  get active(): string {
    return this.#active;
  }

  /** 打开项目的标签并切过去；返回这是不是新开的（已经开着就只切换） */
  open(playgroundId: string): boolean {
    const isNew = !this.#open.includes(playgroundId);
    if (isNew) this.#open = [...this.#open, playgroundId];
    this.#active = playgroundId;
    return isNew;
  }

  /** 切到资源库或一个已打开的标签；不存在的 id 忽略 */
  select(id: string): void {
    if (id === LIBRARY_TAB || this.#open.includes(id)) this.#active = id;
  }

  /** 项目已不在资源库里（被删），它的标签随之去掉 */
  retain(existing: ReadonlySet<string>): void {
    this.#open = this.#open.filter((id) => existing.has(id));
    if (this.#active !== LIBRARY_TAB && !this.#open.includes(this.#active)) {
      this.#active = LIBRARY_TAB;
    }
  }
}
