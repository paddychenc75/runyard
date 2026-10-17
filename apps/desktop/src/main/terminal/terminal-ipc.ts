import type { TerminalMethod, TerminalSize, TerminalSnapshot } from "../../shared/terminal.ts";
import type { TerminalService } from "./terminal-service.ts";

// 把界面发来的终端消息接到服务上。页面发来的数据不可信：形状不对一律不调用服务。

type Params = Record<string, unknown>;

function asParams(value: unknown): Params | null {
  return typeof value === "object" && value !== null ? (value as Params) : null;
}

function project(p: Params | null): string | null {
  return p !== null && typeof p.project === "string" && p.project !== "" ? p.project : null;
}

function sizeOf(p: Params): TerminalSize | null {
  const { cols, rows } = p;
  const ok = (n: unknown): n is number =>
    Number.isInteger(n) && (n as number) > 0 && (n as number) < 10_000;
  return ok(cols) && ok(rows) ? { cols, rows } : null;
}

const noTerminal: TerminalSnapshot = { state: { kind: "none" }, output: "" };

export function terminalMethods(
  service: TerminalService | undefined,
): Record<TerminalMethod, (param: unknown) => unknown> {
  // 没接线（测试里的最小装配）时当作没有终端
  const need = (): TerminalService => {
    if (service === undefined) throw new Error("terminal service unavailable");
    return service;
  };
  return {
    "terminal.open": async (param) => {
      const p = asParams(param);
      const id = project(p);
      const size = p === null ? null : sizeOf(p);
      return id === null || size === null ? noTerminal : await need().open(id, size);
    },
    "terminal.attach": async (param) => {
      const id = project(asParams(param));
      return id === null ? noTerminal : await need().attach(id);
    },
    "terminal.detach": (param) => {
      const id = project(asParams(param));
      if (id !== null) need().detach(id);
    },
    "terminal.write": (param) => {
      const p = asParams(param);
      const id = project(p);
      if (id !== null && typeof p?.data === "string") need().write(id, p.data);
    },
    "terminal.resize": (param) => {
      const p = asParams(param);
      const id = project(p);
      const size = p === null ? null : sizeOf(p);
      if (id !== null && size !== null) need().resize(id, size);
    },
    "terminal.ack": (param) => {
      const p = asParams(param);
      const id = project(p);
      if (id !== null && typeof p?.length === "number") need().ack(id, p.length);
    },
    "terminal.clear": (param) => {
      const id = project(asParams(param));
      if (id !== null) need().clear(id);
    },
    "terminal.reopen": async (param) => {
      const p = asParams(param);
      const id = project(p);
      const size = p === null ? null : sizeOf(p);
      return id === null || size === null ? noTerminal : await need().reopen(id, size);
    },
    "terminal.foreground": async (param) => {
      const id = project(asParams(param));
      return id === null ? { command: null } : await need().foreground(id);
    },
    "terminal.status": async (param) => {
      const id = project(asParams(param));
      return id === null ? { open: false, command: null } : await need().status(id);
    },
    "terminal.busy": async () => await need().busyCommands(),
  };
}
