import type { HostCommand, HostEvent } from "../../../shared/pty-host-messages.ts";
import type { PtyHostLink } from "../terminal-service.ts";

// 假的 pty-host 连接：按命令回应，像一个能立刻起好 shell 的后台进程；测试可以注入输出、让它崩溃。

export class FakeHostLink implements PtyHostLink {
  readonly commands: HostCommand[] = [];
  killed = false;
  /** 下一次 open 的结果：true 起来，false 起不来 */
  startOk = true;
  /** end 时不回应（模拟 pty-host 卡住） */
  stuckOnEnd = false;
  /** 对所有命令都不回应（模拟 pty-host 没反应） */
  silent = false;
  /** foreground 的回答，按项目 */
  foregroundOf: Record<string, string | null> = {};
  readonly pids = new Map<string, number>();
  readonly #events: ((event: HostEvent) => void)[] = [];
  readonly #exits: (() => void)[] = [];
  #nextPid = 5000;

  post(command: HostCommand): void {
    this.commands.push(command);
    if (!this.silent) queueMicrotask(() => this.#respond(command));
  }

  onEvent(listener: (event: HostEvent) => void): void {
    this.#events.push(listener);
  }

  onExit(listener: () => void): void {
    this.#exits.push(listener);
  }

  kill(): void {
    this.killed = true;
  }

  #respond(command: HostCommand): void {
    switch (command.type) {
      case "open": {
        if (!this.startOk) {
          this.emit({ type: "start-failed", project: command.project });
          return;
        }
        const pid = this.#nextPid++;
        this.pids.set(command.project, pid);
        this.emit({
          type: "started",
          project: command.project,
          pid,
          startTime: pid * 10,
          shell: "/bin/zsh",
        });
        return;
      }
      case "end":
        if (this.stuckOnEnd) return;
        this.emit({ type: "exit", project: command.project, exitCode: 129, requested: true });
        this.emit({ type: "closed", project: command.project, id: command.id });
        return;
      case "foreground":
        this.emit({
          type: "foreground",
          project: command.project,
          id: command.id,
          command: this.foregroundOf[command.project] ?? null,
        });
        return;
      default:
        return;
    }
  }

  emit(event: HostEvent): void {
    for (const listener of this.#events) listener(event);
  }

  /** pty-host 进程意外结束 */
  crash(): void {
    for (const listener of this.#exits) listener();
  }

  /** 发给 pty-host 的某类命令 */
  sent<T extends HostCommand["type"]>(type: T): Extract<HostCommand, { type: T }>[] {
    return this.commands.filter((c): c is Extract<HostCommand, { type: T }> => c.type === type);
  }
}
