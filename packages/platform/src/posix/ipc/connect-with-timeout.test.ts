import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isPlatformError } from "../../platform-error.ts";
import { connectWithTimeout } from "./connect-with-timeout.ts";

class FakeSocket extends EventEmitter {
  destroyed = false;
  destroy() {
    this.destroyed = true;
    return this;
  }
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return isPlatformError(error) ? error.error.code : "other";
  }
  return "resolved";
}

afterEach(() => vi.useRealTimers());

describe("connectWithTimeout", () => {
  it("连上就返回这个 socket，计时器不再触发", async () => {
    const socket = new FakeSocket();
    const promise = connectWithTimeout(() => socket as unknown as Socket, 1000, "/x");
    socket.emit("connect");
    await expect(promise).resolves.toBe(socket);
    expect(socket.destroyed).toBe(false);
  });

  it("超时抛 SUPERVISOR_UNAVAILABLE 并销毁 socket（用假时钟，不真等）", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const result = codeOf(connectWithTimeout(() => socket as unknown as Socket, 1000, "/x"));
    await vi.advanceTimersByTimeAsync(999);
    expect(socket.destroyed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("SUPERVISOR_UNAVAILABLE");
    expect(socket.destroyed).toBe(true);
  });

  it("连接出错（没有监听者、没有权限）也是 SUPERVISOR_UNAVAILABLE", async () => {
    for (const code of ["ENOENT", "ECONNREFUSED", "EACCES"]) {
      const socket = new FakeSocket();
      const result = codeOf(connectWithTimeout(() => socket as unknown as Socket, 1000, "/x"));
      socket.emit("error", Object.assign(new Error(code), { code }));
      await expect(result).resolves.toBe("SUPERVISOR_UNAVAILABLE");
    }
  });
});
