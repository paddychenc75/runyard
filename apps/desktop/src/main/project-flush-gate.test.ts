import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLUSH_ACK_TIMEOUT_MS, ProjectFlushGate } from "./project-flush-gate.ts";

// 改名、移到废纸篓前问界面写入未保存的修改（规格 DESKTOP-EDITOR-75 至 78 的主进程一侧）

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const sent: { id: number; project: string; ask: boolean }[] = [];
  const gate = new ProjectFlushGate((id, project, ask) => {
    sent.push({ id, project, ask });
    return true;
  });
  return { gate, sent };
}

describe("项目写入关口", () => {
  it("请求带项目和能不能问用户；界面回 proceed 就放行，回 cancel 就是用户取消", async () => {
    const { gate, sent } = setup();
    const first = gate.request("a", true);
    const second = gate.request("b", false);
    expect(sent).toEqual([
      { id: 1, project: "a", ask: true },
      { id: 2, project: "b", ask: false },
    ]);
    gate.reply({ id: 2, reply: "proceed" });
    gate.reply({ id: 1, reply: "cancel" });
    expect(await first).toBe(false);
    expect(await second).toBe(true);
  });

  it("界面一直不回 ack：超时放行，不让改名、移走卡住", async () => {
    const { gate } = setup();
    const pending = gate.request("a", false);
    await vi.advanceTimersByTimeAsync(FLUSH_ACK_TIMEOUT_MS);
    expect(await pending).toBe(true);
  });

  it("回了 ack 之后不再设时限（用户可能正在回答询问）", async () => {
    const { gate } = setup();
    let settled = false;
    const pending = gate.request("a", true).then((proceed) => {
      settled = true;
      return proceed;
    });
    gate.reply({ id: 1, reply: "ack" });
    await vi.advanceTimersByTimeAsync(FLUSH_ACK_TIMEOUT_MS * 10);
    expect(settled).toBe(false);
    gate.reply({ id: 1, reply: "proceed" });
    expect(await pending).toBe(true);
  });

  it("发不出去（窗口已销毁）或界面进程没了：放行；过期、不认识的编号不理", async () => {
    const gone = new ProjectFlushGate(() => false);
    expect(await gone.request("a", true)).toBe(true);
    const { gate } = setup();
    const pending = gate.request("a", true);
    gate.reply({ id: 99, reply: "cancel" });
    gate.abandon();
    expect(await pending).toBe(true);
  });
});
