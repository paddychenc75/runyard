import type { RunyardClient } from "@runyard/client";
import { clientError } from "@runyard/client";
import { cleanLogEntries } from "@runyard/core";
import type { LogEntry, Playground, RunSnapshot, RunState } from "@runyard/protocol";
import { expect, it } from "vitest";

// stop / status / logs / rm 的单元测试共用的“管理进程”：按协议登记表的语义在内存里回答
// run.*、playground.*、logs.read|follow，事件由测试手动推。不是产品代码。

export interface FakeLog {
  runId: string;
  entries: LogEntry[];
}

export interface FakeSupervisorOptions {
  playgrounds?: Playground[];
  runs?: RunSnapshot[];
  logs?: Record<string, FakeLog>;
  /** playground.trash 失败时抛出的错误码 */
  trashFails?: "TRASH_UNAVAILABLE" | "PATH_LOCKED";
}

export const NOW = 1_760_000_000_000;

export function playground(name: string, patch: Partial<Playground> = {}): Playground {
  return {
    id: `id-${name}`,
    name,
    path: `/fake-home/Runyard/${name}`,
    kind: "server",
    template: { id: "html", source: "builtin", appVersion: "0.0.0" },
    runner: "static",
    createdAt: NOW,
    createdBy: { kind: "cli" },
    autoClean: { enabled: false },
    lastUsedAt: NOW,
    ...patch,
  };
}

export function run(name: string, patch: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    runId: `run-${name}`,
    playgroundId: `id-${name}`,
    name,
    kind: "server",
    state: "ready",
    owner: { kind: "cli", command: `runyard run ${name}` },
    startedAt: NOW,
    cursor: `run-${name}:0`,
    port: 7104,
    url: "http://127.0.0.1:7104/",
    ...patch,
  };
}

export class FakeSupervisor {
  readonly playgrounds: Playground[];
  readonly runs: RunSnapshot[];
  readonly logs: Map<string, FakeLog>;
  readonly calls: { method: string; params: unknown }[] = [];
  readonly trashed: string[] = [];
  readonly #listeners = new Set<() => void>();
  readonly #options: FakeSupervisorOptions;
  unsubscribed = 0;

  get listening(): number {
    return this.#listeners.size;
  }

  constructor(options: FakeSupervisorOptions = {}) {
    this.#options = options;
    this.playgrounds = options.playgrounds ?? [];
    this.runs = options.runs ?? [];
    this.logs = new Map(Object.entries(options.logs ?? {}));
  }

  get client(): RunyardClient {
    const closed = new Promise<void>(() => undefined);
    return {
      call: (method: string, params: unknown) => this.#call(method, params),
      followLogs: async (params: unknown, listener: () => void) => this.#listen(params, listener),
      subscribe: async (_topics: unknown, listener: () => void) =>
        this.#listen(undefined, listener),
      closed,
      close: () => undefined,
    } as unknown as RunyardClient;
  }

  /** 推一条新日志并通知订阅者；state 给了就同时改运行状态（先写日志、后改状态，和引擎一致） */
  emit(name: string, entry: LogEntry, state?: RunState): void {
    this.logs.get(name)?.entries.push(entry);
    if (state !== undefined) this.#setState(name, state);
    for (const listener of this.#listeners) listener();
  }

  finish(name: string, state: RunState): void {
    this.#setState(name, state);
    for (const listener of this.#listeners) listener();
  }

  #setState(name: string, state: RunState): void {
    const found = this.runs.find((r) => r.name === name);
    if (found !== undefined) found.state = state;
  }

  async #listen(_params: unknown, listener: () => void) {
    this.#listeners.add(listener);
    return {
      sub: this.#listeners.size,
      unsubscribe: async () => {
        this.#listeners.delete(listener);
        this.unsubscribed += 1;
      },
    };
  }

  #find(ref: string): Playground {
    const found = this.playgrounds.find((p) => p.name === ref || p.id === ref || p.path === ref);
    if (found === undefined) throw clientError("PLAYGROUND_NOT_FOUND", { name: ref }, "no such");
    return found;
  }

  async #call(method: string, params: unknown): Promise<unknown> {
    this.calls.push({ method, params });
    const p = params as Record<string, unknown>;
    switch (method) {
      case "run.list":
        return p.running === true ? this.runs.filter((r) => isActive(r.state)) : this.runs;
      case "run.stop": {
        const target = this.#find(String(p.playground));
        const found = this.runs.find((r) => r.playgroundId === target.id);
        if (found === undefined) throw clientError("RUN_NOT_FOUND", { runId: target.name }, "none");
        if (isActive(found.state)) found.state = "stopped";
        return found;
      }
      case "run.stopAll": {
        const stopped: string[] = [];
        for (const r of this.runs) {
          if (!isActive(r.state) || (p.mine === true && r.owner.kind !== "cli")) continue;
          r.state = "stopped";
          stopped.push(r.runId);
        }
        return { stopped };
      }
      case "playground.list":
        return this.playgrounds;
      case "playground.get":
        return this.#find(String(p.playground));
      case "playground.trash": {
        const target = this.#find(String(p.playground));
        if (this.#options.trashFails !== undefined) {
          throw clientError(this.#options.trashFails, { name: target.name }, "cannot trash");
        }
        for (const r of this.runs) if (r.playgroundId === target.id) r.state = "stopped";
        this.playgrounds.splice(this.playgrounds.indexOf(target), 1);
        this.trashed.push(target.path);
        return { trashed: true, deletedRegenerable: [] };
      }
      case "logs.read":
        return this.#read(p);
      default:
        throw new Error(`unexpected call ${method}`);
    }
  }

  #read(p: Record<string, unknown>) {
    const target = this.#find(String(p.playground));
    const log = this.logs.get(target.name);
    const state = this.runs.find((r) => r.playgroundId === target.id)?.state;
    if (log === undefined) {
      return { entries: [], cursor: "none:0", truncated: false };
    }
    const last = log.entries.length;
    let from = 0;
    let truncated = false;
    if (typeof p.since === "string") {
      const [runId, seq] = [
        p.since.slice(0, p.since.lastIndexOf(":")),
        Number(p.since.split(":").at(-1)),
      ];
      if (runId === log.runId) from = seq;
      else truncated = true;
    }
    let entries = log.entries.slice(from);
    if (p.raw !== true) entries = cleanLogEntries(entries);
    if (typeof p.tail === "number") entries = entries.slice(-p.tail);
    return {
      entries,
      cursor: `${log.runId}:${last}`,
      truncated,
      ...(state === undefined ? {} : { state }),
    };
  }
}

function isActive(state: RunState): boolean {
  return !["stopped", "finished", "errored", "crashed", "failed"].includes(state);
}

export const stdout = (text: string, at = 1): LogEntry => ({ at, kind: "stdout", text });

it("fake-supervisor: 先写日志后改状态的假管理进程能回答 logs.read", async () => {
  const fake = new FakeSupervisor({
    playgrounds: [playground("demo")],
    runs: [run("demo")],
    logs: { demo: { runId: "run-demo", entries: [stdout("a"), stdout("b")] } },
  });
  const result = (await fake.client.call("logs.read", { playground: "demo", tail: 1 })) as {
    entries: LogEntry[];
    cursor: string;
  };
  expect(result.entries).toEqual([stdout("b")]);
  expect(result.cursor).toBe("run-demo:2");
});
