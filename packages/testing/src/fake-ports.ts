import type { PortStatus } from "@runyard/platform";
import type { FakeClock } from "./fake-clock.ts";

export interface PortOccupant {
  readonly pid: number;
  readonly name: string;
  /** 现有连接数，默认 0 */
  readonly connections?: number;
  /** 只监听 127.0.0.1，默认 true */
  readonly loopbackOnly?: boolean;
}

// 假端口表：被占用、保留、空闲，以及“过一会儿变空闲”（用假时钟推进）。
// 只记状态，不真的绑端口，所以测试之间不会抢端口，也不依赖机器上正在发生什么。
export class FakePorts {
  readonly #clock: FakeClock;
  readonly #occupied = new Map<number, PortOccupant>();
  readonly #reserved = new Set<number>();

  constructor(clock: FakeClock) {
    this.#clock = clock;
  }

  occupy(port: number, occupant: PortOccupant): void {
    this.#occupied.set(port, occupant);
  }

  /** 系统不许绑定（对应 `reserved`） */
  reserve(port: number): void {
    this.#reserved.add(port);
  }

  release(port: number): void {
    this.#occupied.delete(port);
    this.#reserved.delete(port);
  }

  /** 假时间过了 ms 毫秒后变空闲，用来测“停止后 3 秒内能重新绑定” */
  releaseAfter(port: number, ms: number): void {
    this.#clock.setTimeout(() => this.release(port), ms);
  }

  status(port: number): PortStatus {
    if (this.#reserved.has(port)) return "reserved";
    return this.#occupied.has(port) ? "in-use" : "free";
  }

  occupant(port: number): { pid: number; name: string } | null {
    const found = this.#occupied.get(port);
    return found === undefined ? null : { pid: found.pid, name: found.name };
  }

  connections(port: number): number {
    return this.#occupied.get(port)?.connections ?? 0;
  }

  loopbackOnly(port: number): boolean {
    return this.#occupied.get(port)?.loopbackOnly ?? true;
  }

  /** 当前由某个 pid 占着的端口 */
  heldBy(pid: number): number[] {
    return [...this.#occupied].filter(([, who]) => who.pid === pid).map(([port]) => port);
  }
}
