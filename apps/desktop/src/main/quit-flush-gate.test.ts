import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACK_TIMEOUT_MS, QuitFlushGate } from "./quit-flush-gate.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function gate(sent = true) {
  const requests: number[] = [];
  const instance = new QuitFlushGate((id) => {
    requests.push(id);
    return sent;
  });
  return { instance, requests };
}

describe("退出前问界面", () => {
  it("[DESKTOP-EDITOR-27] 界面回 proceed 才放行，期间不设时限", async () => {
    const { instance, requests } = gate();
    const answer = instance.request();
    const settled = vi.fn();
    void answer.then(settled);
    instance.reply({ id: requests[0] ?? 0, reply: "ack" });
    // 用户正在回答询问：过了很久也不放行
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(settled).not.toHaveBeenCalled();
    instance.reply({ id: requests[0] ?? 0, reply: "proceed" });
    expect(await answer).toBe(true);
  });

  it("[DESKTOP-EDITOR-28] 界面回 cancel（用户在询问里选了取消）：不放行", async () => {
    const { instance, requests } = gate();
    const answer = instance.request();
    instance.reply({ id: requests[0] ?? 0, reply: "cancel" });
    expect(await answer).toBe(false);
  });

  it("界面一直不回应（崩溃、没加载出来）：超时放行，不让 ⌘Q 失灵", async () => {
    const { instance } = gate();
    const answer = instance.request();
    await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);
    expect(await answer).toBe(true);
  });

  it("窗口已销毁（发不出去）或界面进程没了：立即放行", async () => {
    expect(await gate(false).instance.request()).toBe(true);
    const { instance } = gate();
    const answer = instance.request();
    instance.abandon();
    expect(await answer).toBe(true);
  });

  it("重复请求共用同一次询问；过期或不认识的回话不理", async () => {
    const { instance, requests } = gate();
    const first = instance.request();
    const second = instance.request();
    expect(requests).toHaveLength(1);
    instance.reply({ id: 999, reply: "cancel" });
    instance.reply({ id: requests[0] ?? 0, reply: "proceed" });
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    // 回完之后可以再问一次，编号不同
    const third = instance.request();
    expect(requests).toHaveLength(2);
    instance.reply({ id: requests[1] ?? 0, reply: "cancel" });
    expect(await third).toBe(false);
  });
});
